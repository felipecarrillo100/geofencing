import { Client as PgClient } from "pg";
import { config } from "../config.js";
import logger from "../utils/logger.js";
import {publishWithPolicies} from "../broker/activemq.js";

export async function startFenceEvents() {
    const pg = new PgClient({
        user: config.pgUser,
        password: config.pgPassword,
        host: config.pgHost,
        database: config.pgDatabase,
        port: config.pgPort,
    });

    await pg.connect();
    logger.info("[PG] Connected");
    await pg.query(`LISTEN ${config.pgChannel}`);
    logger.info(`[PG] LISTEN '${config.pgChannel}'`);

    pg.on("notification", (msg) => {
        if (msg.channel !== config.pgChannel || !msg.payload) return;

        const dest = config.fenceTopic;

        try {
            // If your payload is a JSON string, parse it
            const bodyObj = JSON.parse(msg.payload);

            // Send to ActiveMQ first
            publishWithPolicies(dest, JSON.stringify(bodyObj));

            logger.info("[PG EVENT] Published fence event", dest);
        } catch (e) {
            logger.error("[PG] Invalid payload", msg.payload, e);
        }
    });

    pg.on("error", (err) => logger.error("[PG] Error", err));

    return pg;
}
