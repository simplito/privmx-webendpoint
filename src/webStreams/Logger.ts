/**
 * Internal logging for the SDK.
 *
 * The library is **silent by default** — it never writes to the host
 * application's console unless logging is explicitly enabled with
 * {@link setEndpointLogger}. This keeps production consoles clean while letting
 * developers opt into diagnostics (or pipe logs to their own sink) on demand.
 *
 * Severity ordering (lower number = higher severity):
 * - 0 ERROR
 * - 1 WARN
 * - 2 INFO
 * - 3 DEBUG
 *
 * A message is emitted only when its severity is ≤ the configured threshold.
 */
export type LogLevelName = "silent" | "error" | "warn" | "info" | "debug";

/**
 * Destination for log records. Receives the numeric severity, its label, and
 * the original arguments — implement it to forward logs to a custom backend.
 */
export type LogSink = (level: number, label: string, args: unknown[]) => void;

const LEVELS: Record<LogLevelName, number> = {
    silent: -1,
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

/** Default sink: timestamp-prefixed `console`. Only used once logging is enabled. */
const consoleSink: LogSink = (_level, label, args) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${label}]`, ...args);
};

// Threshold starts at `silent` so nothing is emitted until the host opts in.
let threshold = LEVELS.silent;
let sink: LogSink = consoleSink;

/**
 * Enables or reconfigures SDK logging. Off by default — call this once (e.g.
 * during development) to surface internal diagnostics, and omit it in
 * production to keep the console clean.
 *
 * @param {object} options logging configuration
 * @param {LogLevelName} [options.level] lowest severity to emit; `"silent"`
 *   (the default) suppresses everything, `"warn"` emits warnings and errors, etc.
 * @param {LogSink} [options.sink] custom destination; defaults to a
 *   timestamp-prefixed `console`. Pass your own to forward logs elsewhere.
 */
export function setEndpointLogger(options: { level?: LogLevelName; sink?: LogSink }): void {
    if (options.level !== undefined) {
        threshold = LEVELS[options.level];
    }
    if (options.sink !== undefined) {
        sink = options.sink;
    }
}

/**
 * Thin severity-tagged front-end over the module-global sink/threshold
 * configured by {@link setEndpointLogger}. Construct freely; all instances share
 * the same global configuration.
 * @internal
 */
export class Logger {
    debug(...args: unknown[]): void {
        this.emit(3, "DEBUG", args);
    }

    info(...args: unknown[]): void {
        this.emit(2, "INFO", args);
    }

    warn(...args: unknown[]): void {
        this.emit(1, "WARN", args);
    }

    error(...args: unknown[]): void {
        this.emit(0, "ERROR", args);
    }

    private emit(level: number, label: string, args: unknown[]): void {
        if (level <= threshold) {
            sink(level, label, args);
        }
    }
}

/**
 * Shared logger for module-level (non-class) call sites.
 * @internal
 */
export const logger = new Logger();
