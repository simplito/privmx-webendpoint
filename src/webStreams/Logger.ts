export type LoggerLevel = "debug" | "info" | "important-only";
export class Logger {
    private static instance: Logger;
    private static logLevel: LoggerLevel = "important-only";

    static get() {
        if (!this.instance) {
            this.instance = new Logger();
        }
        return this.instance;
    }

    log(level: LoggerLevel, ...args: any[]) {
        if (Logger.logLevel === "debug") {
            console.log(...args);
        }
        else if (level === "info" && Logger.logLevel === "info") {
            console.log(...args);
        }
        else if(level === "important-only" && Logger.logLevel === "important-only") {
            console.log(...args);
        }
    }
}