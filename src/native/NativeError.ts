export interface RawCppError {
    code: number;
    name: string;
    scope: string;
    description: string;
    full: string;
}

export class NativeError extends Error {
    public readonly code: number;
    public readonly scope: string;
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
