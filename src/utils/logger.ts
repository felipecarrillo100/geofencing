export default {
    info:  (...args: any[]) => console.log("[INFO]", ...args),
    warn:  (...args: any[]) => console.warn("[WARN]", ...args),
    error: (...args: any[]) => console.error("[ERROR]", ...args),
    debug: (...args: any[]) => {
        if (process.env.LOG_LEVEL === "debug") console.log("[DEBUG]", ...args);
    },
};
