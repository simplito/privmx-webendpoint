/**
 * Wire-format codec for version-2 encrypted media frames.
 *
 * The codec header stays cleartext at offset 0 so the SFU can still read the
 * VP8 keyframe bit; all PrivMX metadata lives in a fixed-size trailer, so the
 * codec header's position is never disturbed and parsing is bounds-safe (unlike
 * the old variable-length, parse-from-the-tail layout).
 *
 * ```
 * [CodecHeader: ClearLen B][Ciphertext+Tag: var][Trailer: 16 B]
 *
 * Trailer (Version is the last byte, so a decoder reads it first):
 * [Prefix:8B][Counter:4B][Epoch:1B][ClearLen:1B][Flags:1B][Version:1B]
 * ```
 *
 * - `Prefix ∥ Counter` (12 B) is the AES-256-GCM nonce (see {@link FrameIvGenerator}).
 * - `Epoch` selects the key from the `KeyStore` (replaces the old per-frame
 *   variable-length key-id string).
 * - `ClearLen` is the codec-header length - the decoder reads it instead of
 *   assuming a codec, so switching codec never breaks decoding.
 * - `Flags` bit 0 marks a keyframe; the remaining bits are reserved (kept 0).
 * - The codec header plus the whole trailer is the GCM AAD, so every metadata
 *   field is authenticated.
 * @internal
 */
export const FRAME_V2_VERSION = 2;
export const FRAME_V2_TRAILER_LENGTH = 16;
export const FRAME_V2_FLAG_KEYFRAME = 0x01;

const GCM_TAG_LENGTH_BYTES = 16;
const IV_LENGTH = 12;
const OFFSET_EPOCH = 12;
const OFFSET_CLEAR_LEN = 13;
const OFFSET_FLAGS = 14;
const OFFSET_VERSION = 15;

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
}

/**
 * Decomposed v2 trailer produced by {@link parseFrameV2Trailer}.
 * @internal
 */
export interface FrameV2Trailer {
    /** `Prefix ∥ Counter` - the 12-byte GCM nonce. */
    iv: Uint8Array;
    epoch: number;
    clearLen: number;
    flags: number;
    /** The raw 16 trailer bytes, needed verbatim as part of the AAD. */
    trailer: Uint8Array;
}

/**
 * Builds the 16-byte v2 trailer. `iv` must be the 12-byte `Prefix ∥ Counter`
 * nonce; its bytes become the first 12 bytes of the trailer.
 */
export function serializeFrameV2Trailer(
    iv: Uint8Array,
    epoch: number,
    clearLen: number,
    flags: number,
): Uint8Array {
    const trailer = new Uint8Array(FRAME_V2_TRAILER_LENGTH);
    trailer.set(iv, 0);
    trailer[OFFSET_EPOCH] = epoch;
    trailer[OFFSET_CLEAR_LEN] = clearLen;
    trailer[OFFSET_FLAGS] = flags;
    trailer[OFFSET_VERSION] = FRAME_V2_VERSION;
    return trailer;
}

/**
 * Parses the trailing 16 bytes of `data` as a v2 trailer. Returns `null` when
 * `data` is too short to hold a trailer or its last byte is not the v2 version
 * marker (i.e. the frame is not v2). Never throws. `iv`/`trailer` are copies, so
 * they stay valid after the caller reassigns the frame's backing buffer.
 */
export function parseFrameV2Trailer(data: ArrayBuffer): FrameV2Trailer | null {
    const len = data.byteLength;
    if (len < FRAME_V2_TRAILER_LENGTH) return null;
    const trailer = new Uint8Array(data, len - FRAME_V2_TRAILER_LENGTH, FRAME_V2_TRAILER_LENGTH);
    if (trailer[OFFSET_VERSION] !== FRAME_V2_VERSION) return null;
    return {
        iv: trailer.slice(0, IV_LENGTH),
        epoch: trailer[OFFSET_EPOCH],
        clearLen: trailer[OFFSET_CLEAR_LEN],
        flags: trailer[OFFSET_FLAGS],
        trailer: trailer.slice(),
    };
}

/**
 * The GCM additional authenticated data for a v2 frame: the cleartext codec
 * header followed by the whole trailer. Both encrypt and decrypt build it the
 * same way, so the authenticated bytes match.
 */
export function frameV2Aad(codecHeader: Uint8Array, trailer: Uint8Array): Uint8Array {
    return concat(codecHeader, trailer);
}

/**
 * Assembles a complete v2 wire frame: `codecHeader ∥ ciphertext+tag ∥ trailer`.
 * Returns the backing `ArrayBuffer`, ready to assign to `encodedFrame.data`.
 */
export function assembleFrameV2(
    codecHeader: Uint8Array,
    ciphertext: Uint8Array,
    trailer: Uint8Array,
): ArrayBuffer {
    const out = new Uint8Array(codecHeader.length + ciphertext.length + trailer.length);
    out.set(codecHeader, 0);
    out.set(ciphertext, codecHeader.length);
    out.set(trailer, codecHeader.length + ciphertext.length);
    return out.buffer;
}

/**
 * A fully split v2 frame, ready to decrypt.
 * @internal
 */
export interface ParsedFrameV2 {
    iv: Uint8Array;
    epoch: number;
    flags: number;
    /** Cleartext codec header - a view into the frame buffer. */
    codecHeader: Uint8Array;
    /** Ciphertext with the trailing GCM tag - a view into the frame buffer. */
    ciphertext: Uint8Array;
    /** GCM additional authenticated data (`codecHeader ∥ trailer`), a fresh copy. */
    aad: Uint8Array;
}

/**
 * Parses a complete v2 frame into the pieces needed to decrypt it, or returns
 * `null` when `data` is not v2 or is too short/malformed to hold a codec header
 * plus a GCM tag. Never throws; `ClearLen` is bounds-checked before slicing, so
 * a forged length cannot produce an out-of-range read.
 */
export function parseFrameV2(data: ArrayBuffer): ParsedFrameV2 | null {
    const parsed = parseFrameV2Trailer(data);
    if (!parsed) return null;

    const trailerStart = data.byteLength - FRAME_V2_TRAILER_LENGTH;
    // The codec header plus at least a GCM tag must fit before the trailer.
    if (parsed.clearLen > trailerStart - GCM_TAG_LENGTH_BYTES) return null;

    // Views, not copies: `aad` below copies the codec header synchronously, and
    // WebCrypto snapshots `ciphertext` synchronously at the decrypt call, so
    // neither needs to outlive the frame buffer - this avoids a body-sized copy
    // per decoded frame (matching how the encode path passes the body as a view).
    const codecHeader = new Uint8Array(data, 0, parsed.clearLen);
    const ciphertext = new Uint8Array(data, parsed.clearLen, trailerStart - parsed.clearLen);
    return {
        iv: parsed.iv,
        epoch: parsed.epoch,
        flags: parsed.flags,
        codecHeader,
        ciphertext,
        aad: concat(codecHeader, parsed.trailer),
    };
}
