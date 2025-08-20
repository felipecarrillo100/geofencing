import { startHttpServer } from "./server/expressServer.js";
import { connectActiveMQ, isActiveMQEnabled } from "./broker/activemq.js";
import { startFenceEvents } from "./db/fenceEvents.js";
import logger from "./utils/logger.js";

async function main() {
    // Start HTTP + STOMP Gateway for browsers
    const server = startHttpServer();

    // ActiveMQ relay (only for /topic/**)
    connectActiveMQ();

    // DB → /topic/fence_events (via ActiveMQ)
    await startFenceEvents();

    // Startup summary
    if (isActiveMQEnabled()) {
        logger.info("[Mode] Using REMOTE ActiveMQ for /topic/** ; no local /topic delivery");
        logger.info("[Mode] /queue/** is local-only (not relayed)");
    } else {
        logger.info("[Mode] ActiveMQ not configured → /topic/** will not be delivered");
    }

    // Graceful shutdown
    function shutdown() {
        logger.info("Shutting down...");
        server.close(() => logger.info("[HTTP] Closed"));
        process.exit(0);
    }
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main().catch((err) => {
    console.error("[Startup] Fatal", err);
    process.exit(1);
});
