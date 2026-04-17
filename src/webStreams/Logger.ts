/**
 * Minimal timestamp-prefixed logger used internally by the webStreams layer.
 *
 * Log levels (lower number = higher severity):
 * - 0 ERROR
 * - 1 WARN  (default threshold)
 * - 2 INFO
 * - 3 DEBUG
 *
 * Only messages whose level is ≤ the configured threshold are emitted.
 */
export class Logger {
    private level: number;

    constructor(level: number = 1) {
        this.level = level;
    }

    debug(...args: unknown[]): void {
        this.log(3, "DEBUG", args);
    }

    info(...args: unknown[]): void {
        this.log(2, "INFO", args);
    }

    warn(...args: unknown[]): void {
        this.log(1, "WARN", args);
    }

    error(...args: unknown[]): void {
        this.log(0, "ERROR", args);
    }

    private log(level: number, prefix: string, args: unknown[]): void {
        if (level <= this.level) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${prefix}]`, ...args);
        }
    }
}
