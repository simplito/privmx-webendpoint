/**
 * THE BLIND STORE - stands in for your S3 bucket or your own API.
 *
 * GroupApi has no storage of its own: it seals bytes and hands them back. Where
 * they live is entirely your problem, and that is the point of this demo - this
 * store never sees a key, a plaintext or an author. It holds opaque envelopes
 * and opaque ciphertext, and it could just as well be a bucket, a Postgres blob
 * column or a USB stick.
 *
 * It is a Map in the page because the demo runs without a server process. Every
 * byte in it is exactly what a real backend would hold.
 */

export interface StoredSubmission {
    id: string;
    /** GroupApi envelope carrying the note (and the file's name, if any). Opaque. */
    note: Uint8Array;
    /** Set when the submission carries a file: the file envelope, separate from its ciphertext. */
    fileEnvelope?: Uint8Array;
    /** The sealed file itself. Opaque; served in ranges. */
    fileCipher?: Uint8Array;
    /** The submission this one replies to. The store knows the thread shape, not its content. */
    parent?: string;
    /** When the store received it - the store's own clock, not the author's. */
    at: number;
}

const submissions = new Map<string, StoredSubmission>();
const listeners = new Set<() => void>();

/** Bytes handed out by {@link range} - what a real deployment would be billed for. */
let served = 0;

function emit(): void {
    listeners.forEach((notify) => notify());
}

export function subscribe(notify: () => void): () => void {
    listeners.add(notify);
    return () => {
        listeners.delete(notify);
    };
}

export function put(submission: StoredSubmission): void {
    submissions.set(submission.id, submission);
    emit();
}

export function get(id: string): StoredSubmission | undefined {
    return submissions.get(id);
}

export function list(): StoredSubmission[] {
    return [...submissions.values()].sort((a, b) => a.at - b.at);
}

/**
 * Serves part of a sealed file, the way a ranged GET would. `seekInEncryptedFile`
 * exists so a reader can ask for exactly the range it needs, and this counter is
 * how the demo shows what that saves.
 */
export function range(id: string, from: number, length: number): Uint8Array {
    const cipher = submissions.get(id)?.fileCipher;
    if (!cipher) return new Uint8Array();
    const slice = cipher.slice(from, from + length);
    served += slice.length;
    emit();
    return slice;
}

export const bytesServed = () => served;

/** Total bytes held, so the inspector can show what the store is actually storing. */
export function totalBytes(): number {
    return list().reduce(
        (n, d) => n + d.note.length + (d.fileEnvelope?.length ?? 0) + (d.fileCipher?.length ?? 0),
        0,
    );
}

/** The first `count` bytes, as hex - an envelope's readable header. */
export function hex(bytes: Uint8Array, count = 24): string {
    return [...bytes.slice(0, count)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")
        .concat(bytes.length > count ? " …" : "");
}

/**
 * The last `count` bytes, as hex.
 *
 * An envelope starts with a header - format version, envelope type, the Group
 * and key it belongs to - all of it deliberately readable, because a reader has
 * to know which key opens the rest. Sampling the *tail* skips past that: what
 * is there is ciphertext and its authentication tag, and no two differ.
 */
export function hexTail(bytes: Uint8Array, count = 16): string {
    return "… ".concat(
        [...bytes.slice(Math.max(0, bytes.length - count))]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" "),
    );
}

/** Ids are the store's, not PrivMX's - nothing about them is secret or signed. */
export const newId = () => crypto.randomUUID();
