/**
 * Raw error payload produced by the C++ core when an exception crosses the
 * WASM boundary. Converted into a {@link NativeError} before reaching
 * application code.
 */
export interface RawCppError {
    /** Combined numeric code: `(scopeCode << 16) | specificCode` - see `NativeErrorCodes.ts`. */
    code: number;
    /** C++ exception class name, e.g. `"StoreFileVersionMismatchException"`. */
    name: string;
    /** Module that raised the error: `"Core"`, `"Connection"`, `"Thread"`, `"Store"`, `"Inbox"`, `"Kvdb"`, `"Event"` or `"StreamRoom"`. */
    scope: string;
    /** Human-readable, situation-specific description (may be empty). */
    description: string;
    /** Full formatted C++ error text, including the static message. */
    full: string;
}

/**
 * Error type thrown (as a rejected promise) by every SDK method whose failure
 * originates in the C++/WASM core - server errors, crypto failures, missing
 * containers, access denials, version conflicts.
 *
 * Wraps the C++ exception that crossed the WASM boundary, preserving its
 * numeric code, module scope and full message, and appends the native cause to
 * the JS stack trace.
 *
 * Branch on failures with `instanceof` and the constants from
 * `NativeErrorCodes.ts` (`CoreErrorCode`, `StoreErrorCode`, …) instead of
 * string-matching messages:
 * ```ts
 * try {
 *     await storeApi.closeFile(handle);
 * } catch (e) {
 *     if (e instanceof NativeError && e.code === StoreErrorCode.FILE_VERSION_MISMATCH) {
 *         // concurrent update - re-open and retry
 *     }
 * }
 * ```
 */
export class NativeError extends Error {
    /**
     * Numeric error code, laid out as `(scopeCode << 16) | specificCode`.
     * Compare against the exported `*ErrorCode` constants.
     */
    public readonly code: number;
    /** Module that raised the error - `"Core"`, `"Store"`, `"Thread"`, … */
    public readonly scope: string;
    /** Full formatted message from the C++ core (also appended to `stack`). */
    public readonly fullMessage: string;

    constructor(raw: RawCppError) {
        super(raw.description || raw.full);

        Object.setPrototypeOf(this, NativeError.prototype);

        this.name = raw.name || "NativeError";
        this.code = raw.code;
        this.scope = raw.scope;
        this.fullMessage = raw.full;

        if (this.stack && raw.full) {
            this.stack += `\n    Caused by Native C++ Exception: ${raw.full}`;
        }
    }
}
