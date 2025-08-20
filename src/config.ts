import dotenv from "dotenv";
dotenv.config();

export const config = {
    // HTTP server
    port: Number(process.env.PORT || 3000),
    staticDir: process.env.STATIC_DIR || "public",

    // ActiveMQ (STOMP over TCP)
    stompHost: process.env.STOMP_HOST || "localhost",
    stompPort: Number(process.env.STOMP_PORT || 61613),
    stompUser: process.env.STOMP_USER || "admin",
    stompPass: process.env.STOMP_PASS || "admin",

    // DB (PostgreSQL)
    pgUser: process.env.PG_USER || "operator",
    pgPassword: process.env.PG_PASSWORD || "operator",
    pgHost: process.env.PG_HOST || "localhost",
    pgDatabase: process.env.PG_DATABASE || "geofencing_test",
    pgPort: Number(process.env.PG_PORT || 5432),
    pgChannel: process.env.PG_CHANNEL || "fence_event",

    // Topic for DB → broker fan-out
    fenceTopic: process.env.FENCE_TOPIC || "/topic/fence_events",
};
