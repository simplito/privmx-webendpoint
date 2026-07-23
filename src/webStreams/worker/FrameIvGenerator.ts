const IV_LENGTH_BYTES = 12;
const IV_PREFIX_LENGTH_BYTES = 8;
const MAX_COUNTER = 0xffffffff;

/**
 * Produces the 12-byte AES-256-GCM nonce (IV) for each outgoing media frame as
 * `randomPrefix(8B) ∥ counter(4B big-endian)` rather than 12 fully random bytes.
 *
 * Why not plain random: every participant in a stream room shares one
 * AES-256-GCM key, so all senders encrypt under the same key. With random
 * 96-bit nonces the GCM birthday bound (~2³² frames under one key, NIST
 * SP 800-38D) is a real risk on long, high-FPS calls, and a single nonce
 * collision under one key is catastrophic (leaks the XOR of plaintexts and the
 * GHASH subkey). A per-instance random prefix plus a strictly monotonic counter
 * makes reuse effectively unreachable: the counter never repeats for a given
 * prefix, and across senders a collision needs two independent 64-bit prefixes
 * to match. The counter absorbs the large dimension (frame count)
 * deterministically, so collision probability scales with the number of senders
 * (~n²/2⁶⁴), not the number of frames.
 *
 * The nonce is transmitted verbatim in the frame trailer, so this is a
 * sender-only change: the wire format is unchanged and stays byte-compatible
 * with peers, which use the transmitted IV as-is.
 *
 * One generator instance must be shared across all of a sender's encode
 * pipelines (audio + video), since they encrypt under the same key; the single
 * shared counter is what keeps their nonces distinct.
 * @internal
 */
export class FrameIvGenerator {
    private readonly iv = new Uint8Array(IV_LENGTH_BYTES);
    private readonly view = new DataView(this.iv.buffer);
    private counter: number;

    /**x
     * @param initialCounter - starting counter value; defaults to 0. Primarily
     *                          a test seam for exercising the wrap path without
     *                          2³² iterations.
     */
    constructor(initialCounter = 0) {
        this.counter = initialCounter;
        this.regeneratePrefix();
    }

    /**
     * Returns the next unique 12-byte IV as a fresh copy (callers may retain it
     * across `await`s; the internal buffer is reused between calls). On 32-bit
     * counter wrap it draws a fresh random prefix and restarts the counter, so a
     * `(prefix, counter)` pair repeats only if the new prefix collides with a
     * previous one (~2⁻⁶⁴, and only after 2³² frames from one generator).
     *
     * Reads and advances the counter synchronously, so concurrent
     * (interleaved-`await`) frame encryptions each get a distinct value.
     */
    next(): Uint8Array {
        if (this.counter > MAX_COUNTER) {
            this.regeneratePrefix();
            this.counter = 0;
        }
        this.view.setUint32(IV_PREFIX_LENGTH_BYTES, this.counter, false);
        this.counter += 1;
        return this.iv.slice();
    }

    private regeneratePrefix(): void {
        crypto.getRandomValues(this.iv.subarray(0, IV_PREFIX_LENGTH_BYTES));
    }
}

export const FRAME_IV_LENGTH_BYTES = IV_LENGTH_BYTES;
