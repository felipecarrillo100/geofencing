import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import crypto from "crypto";
import logger from "../utils/logger.js";
import { addTopicListener, publishToTopic, removeTopicListener } from "../broker/topicManager.js";
import {ensureBrokerSubscription, isActiveMQEnabled, publishToActiveMQ, publishWithPolicies} from "../broker/activemq.js";

/** Client state */
type ClientSubs = Map<
    string,
    { destination: string; listener: (dest: string, body: string) => void }
>;

/** Robust STOMP frame parser (handles CRLF and trailing NUL) */
function parseStompFrame(data: string | Buffer) {
    const frameStr = Buffer.isBuffer(data) ? data.toString("utf-8") : data;
    // Trim trailing NULs
    const withoutNul = frameStr.replace(/\0+$/, "");
    // Normalize CRLF to LF
    const normalized = withoutNul.replace(/\r\n/g, "\n");

    // Split at first empty line
    const splitIndex = normalized.indexOf("\n\n");
    const head = splitIndex >= 0 ? normalized.slice(0, splitIndex) : normalized;
    const body = splitIndex >= 0 ? normalized.slice(splitIndex + 2) : "";

    const [command, ...headerLines] = head.split("\n");
    const headers: Record<string, string> = {};
    for (const line of headerLines) {
        const idx = line.indexOf(":");
        if (idx > -1) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return { command: command.trim(), headers, body };
}

/** Build a minimal STOMP MESSAGE frame (extra headers optional) */
function buildMessageFrame(
    destination: string,
    subscriptionId: string,
    body: string,
    extraHeaders: Record<string, string> = {}
) {
    const msgId = crypto.randomUUID();
    let frame =
        `MESSAGE\n` +
        `destination:${destination}\n` +
        `subscription:${subscriptionId}\n` +
        `message-id:${msgId}\n`;
    for (const [k, v] of Object.entries(extraHeaders)) frame += `${k}:${v}\n`;
    frame += `\n${body}\0`;
    return frame;
}

/** Send CONNECTED frame */
function sendConnected(ws: WebSocket) {
    ws.send(`CONNECTED\nversion:1.2\n\n\0`);
}

/** Main gateway creation */
export function createStompGateway(server: http.Server, path = "/stomp") {
    const wss = new WebSocketServer({ noServer: true });

    // Only upgrade for the configured path
    server.on("upgrade", (req, socket, head) => {
        if (!req.url || !req.url.startsWith(path)) return;
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    });

    const clientSubs = new Map<WebSocket, ClientSubs>();

    wss.on("connection", (ws) => {
        clientSubs.set(ws, new Map());
        logger.info("[Gateway] Browser connected");

        ws.on("message", (raw) => {
            const { command, headers, body } = parseStompFrame(raw as Buffer);

            switch (command) {
                case "CONNECT":
                case "STOMP":
                    sendConnected(ws);
                    break;

                case "SUBSCRIBE": {
                    const dest = headers["destination"];
                    const id = headers["id"] || crypto.randomUUID();
                    if (!dest) return;

                    const subs = clientSubs.get(ws)!;

                    // Listener that delivers ONLY to this client/sub-id
                    const listener = (destination: string, payload: string) => {
                        const s = subs.get(id);
                        if (s && s.destination === destination && ws.readyState === WebSocket.OPEN) {
                            ws.send(buildMessageFrame(destination, id, payload));
                        }
                    };

                    subs.set(id, { destination: dest, listener });
                    addTopicListener(dest, listener);

                    // Critical: if ActiveMQ is enabled and this is a /topic/**,
                    // ensure we are subscribed upstream so messages published to ActiveMQ
                    // come back to our local topic manager and reach this browser.
                    if (isActiveMQEnabled() && dest.startsWith("/topic/")) {
                        ensureBrokerSubscription(dest);
                        logger.debug("[Gateway] Ensured upstream subscription for", dest);
                    }

                    logger.debug("[Gateway] SUBSCRIBE", dest, "id=", id);
                    break;
                }

                case "UNSUBSCRIBE": {
                    const id = headers["id"];
                    if (!id) return;
                    const subs = clientSubs.get(ws)!;
                    const sub = subs.get(id);
                    if (sub) {
                        removeTopicListener(sub.destination, sub.listener);
                        subs.delete(id);
                        logger.debug("[Gateway] UNSUBSCRIBE", sub.destination, "id=", id);
                    }
                    break;
                }

                case "DISCONNECT":
                    ws.close();
                    break;

                case "SEND": {
                    const dest = headers["destination"];
                    if (!dest) return;

                    // Policy:
                    // - If ActiveMQ is configured AND destination is /topic/** → relay ONLY to ActiveMQ
                    //   (local delivery will occur when ActiveMQ sends it back via our upstream subscription)
                    // - Otherwise (e.g., /queue/** or ActiveMQ disabled) → publish locally only.
                    publishWithPolicies(dest, body);

                    break;
                }

                default:
                    logger.debug("[Gateway] Ignored command:", command);
            }
        });

        ws.on("close", () => {
            const subs = clientSubs.get(ws);
            if (subs) {
                for (const sub of subs.values()) {
                    removeTopicListener(sub.destination, sub.listener);
                }
            }
            clientSubs.delete(ws);
            logger.info("[Gateway] Browser disconnected");
        });
    });

    logger.info(`[Gateway] STOMP over WebSocket at path ${path}`);
    return wss;
}
