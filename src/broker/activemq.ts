import StompClient from "stomp-client";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { publishToTopic } from "./topicManager.js";

type BrokerHandler = (destination: string, body: string) => void;

let client: StompClient | null = null;
let connected = false;
const handlers = new Map<string, { subId: number; cb: BrokerHandler }>();
let nextSubId = 1;

/** Connect (or reconnect) to ActiveMQ */
export function connectActiveMQ() {
    if (client) return;

    client = new StompClient(
        config.stompHost,
        config.stompPort,
        config.stompUser,
        config.stompPass
    );

    client.connect(
        () => {
            connected = true;
            logger.info(`[ActiveMQ] Connected ${config.stompHost}:${config.stompPort}`);

            // Re-subscribe all destinations from handlers
            for (const [dest, entry] of handlers) {
                client!.subscribe(dest, (message: string) => {
                    publishToTopic(dest, message);
                    entry.cb(dest, message);
                });
                logger.info(`[ActiveMQ] Re-subscribed ${dest}`);
            }

            // Optional: heartbeat / demo messages
            setInterval(() => {
                client?.publish("/topic/beat", JSON.stringify({ b: 1 }));
            }, 1000);
        },
        (err: Error) => {
            connected = false;
            logger.error("[ActiveMQ] Connection error:", err.message || err);
            client = null;
            setTimeout(connectActiveMQ, 3000);
        }
    );
}

/** Publish message to ActiveMQ */
export function publishToActiveMQ(destination: string, body: string) {
    if (!client || !connected) {
        logger.warn("[ActiveMQ] Not connected, drop message for", destination);
        return;
    }
    try {
        client.publish(destination, body);
    } catch (e) {
        logger.error("[ActiveMQ] publish error", destination, e);
    }
}

/** Ensure subscription exists for a destination; returns internal subId */
export function ensureBrokerSubscription(destination: string, cb?: BrokerHandler): number {
    const existing = handlers.get(destination);
    if (existing) return existing.subId;

    const subId = nextSubId++;
    // Subscribe only once, messages go through topicManager
    client?.subscribe(destination, (message: string) => {
        publishToTopic(destination, message);
        if (cb) cb(destination, message);
    });
    handlers.set(destination, { subId, cb: cb || (() => {}) });
    logger.info("[ActiveMQ] Subscribed", destination, "subId=", subId);
    return subId;
}

/** Remove subscription (handler deleted; ActiveMQ remains subscribed until reconnect) */
export function removeBrokerSubscription(destination: string) {
    if (handlers.delete(destination)) {
        logger.info("[ActiveMQ] Unsubscribe requested", destination);
    }
}

/** Whether ActiveMQ relay is configured */
export function isActiveMQEnabled(): boolean {
    return Boolean(config.stompHost && config.stompPort);
}


export function publishWithPolicies(dest:string, bodyObj: string) {
    if (isActiveMQEnabled() && dest.startsWith("/topic/")) {
        publishToActiveMQ(dest, bodyObj);
    } else {
        // Also publish to local topic manager for browser clients
        publishToTopic(dest, bodyObj);
    }
}
