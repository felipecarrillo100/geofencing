import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import logger from "../utils/logger.js";
import { createStompGateway } from "./stompGateway.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startHttpServer() {
    const app = express();
    const staticDir = path.resolve(__dirname, "..", "..", config.staticDir);
    app.use(express.static(staticDir));

    const server = http.createServer(app);

    // STOMP-over-WS for browsers on /stomp
    createStompGateway(server, "/stomp");

    server.listen(config.port, () => {
        logger.info(`[HTTP] Listening on http://localhost:${config.port}`);
        logger.info(`[Static] Serving ${staticDir}`);
    });

    return server;
}
