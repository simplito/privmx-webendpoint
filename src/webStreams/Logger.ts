export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
}

export class Logger {
    private level: LogLevel;

    constructor(level: LogLevel = LogLevel.ERROR) {
        this.level = level;
    }

    setLevel(level: LogLevel) {
        this.level = level;
    }

    getLevel(): LogLevel {
        return this.level;
    }

    private log(level: LogLevel, prefix: string, args: any[]) {
        if (level <= this.level) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${prefix}]`, ...args);
        }
    }

    debug(...args: any[]) {
        this.log(LogLevel.DEBUG, "DEBUG", args);
    }

    info(...args: any[]) {
        this.log(LogLevel.INFO, "INFO", args);
    }

    warn(...args: any[]) {
        this.log(LogLevel.WARN, "WARN", args);
    }

    error(...args: any[]) {
        this.log(LogLevel.ERROR, "ERROR", args);
    }
}
