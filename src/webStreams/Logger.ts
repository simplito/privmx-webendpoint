export class Logger {
    private level: number;

    constructor(level: number = 1) {
        this.level = level;
    }

    private log(level: number, prefix: string, args: unknown[]) {
        if (level <= this.level) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${prefix}]`, ...args);
        }
    }

    debug(...args: unknown[]) {
        this.log(3, "DEBUG", args);
    }

    info(...args: unknown[]) {
        this.log(2, "INFO", args);
    }

    warn(...args: unknown[]) {
        this.log(1, "WARN", args);
    }

    error(...args: unknown[]) {
        this.log(0, "ERROR", args);
    }
}
