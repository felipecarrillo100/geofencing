import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client as PgClient } from 'pg';
import StompClient from 'stomp-client';
import { WebSocketServer, WebSocket } from 'ws';

// ==== EXPRESS SETUP ====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

const app = express();
app.use(express.static(path.join(__dirname, '../public')));
const server = app.listen(PORT, () => console.log(`[Server] Running on http://localhost:${PORT}`));

// ==== POSTGRES SETUP ====
const pgClient = new PgClient({
    user: 'operator',
    password: 'operator',
    host: 'localhost',
    database: 'geofencing_test',
    port: 5432,
});

// ==== WEBSOCKET + STOMP RELAY ====
interface Subscription {
    id: string;
    topic: string;
}
const wss = new WebSocketServer({ noServer: true });
const wsSubscriptions = new Map<WebSocket, Subscription[]>();

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wsSubscriptions.set(ws, []);

        ws.on('message', (data) => {
            const msg = data.toString();

            // Simple STOMP CONNECT handling
            if (msg.startsWith('CONNECT') || msg.startsWith('STOMP')) {
                const connectedFrame = `CONNECTED\nversion:1.2\n\n\0`;
                ws.send(connectedFrame);
                console.log('[WS] Sent CONNECTED frame');
            }

            // Simple SUBSCRIBE handling
            if (msg.startsWith('SUBSCRIBE')) {
                const destMatch = msg.match(/destination:(\/topic\/[^\n]+)/);
                const idMatch = msg.match(/id:([^\n]+)/);
                if (destMatch && idMatch) {
                    const topic = destMatch[1];
                    const subId = idMatch[1];
                    const subs = wsSubscriptions.get(ws) || [];
                    subs.push({ id: subId, topic });
                    wsSubscriptions.set(ws, subs);
                    console.log(`[WS] Client subscribed to ${topic} with id ${subId}`);
                }
            }
        });

        ws.on('close', () => wsSubscriptions.delete(ws));
    });
});

// ==== ACTIVEMQ STOMP CLIENT ====
const stompClient = new StompClient('localhost', 61613, 'admin', 'admin');

async function main() {
    await pgClient.connect();
    console.log('[PG] Connected');

    await pgClient.query('LISTEN fence_event');

    // Connect to ActiveMQ
    stompClient.connect(
        () => {
            console.log('[STOMP] Connected to ActiveMQ');

            // Subscribe to ActiveMQ topic
            stompClient.subscribe('/topic/fence_events', (message: string) => {
                console.log('[STOMP MESSAGE]', message);

                // Relay to all browser clients subscribed to this topic
                wsSubscriptions.forEach((subs, ws) => {
                    subs.forEach(({ topic, id }) => {
                        if (topic === '/topic/fence_events' && ws.readyState === WebSocket.OPEN) {
                            const frame = `MESSAGE\ndestination:${topic}\nsubscription:${id}\n\n${message}\0`;
                            ws.send(frame);
                        }
                    });
                });
            });
        },
        (err: Error) => console.error('[STOMP] Connection error:', err)
    );

    // Listen to PostgreSQL notifications
    pgClient.on('notification', (msg) => {
        if (msg.channel === 'fence_event' && msg.payload) {
            try {
                const payload = JSON.parse(msg.payload);
                console.log('[PG EVENT]', payload);

                // Publish to ActiveMQ
                stompClient.publish('/topic/fence_events', JSON.stringify(payload));
            } catch (err) {
                console.error('[PG EVENT ERROR]', msg.payload, err);
            }
        }
    });

    console.log('[Server] Node.js is relaying PG events to ActiveMQ and browser STOMP clients');
}

main().catch(console.error);
