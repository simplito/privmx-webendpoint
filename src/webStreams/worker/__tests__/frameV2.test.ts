import {
    FRAME_V2_FLAG_KEYFRAME,
    FRAME_V2_TRAILER_LENGTH,
    FRAME_V2_VERSION,
    assembleFrameV2,
    frameV2Aad,
    parseFrameV2,
    parseFrameV2Trailer,
    serializeFrameV2Trailer,
} from "../frameV2.js";

function iv12(fill = 0x11): Uint8Array {
    return new Uint8Array(12).fill(fill);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

describe("frameV2 trailer codec", () => {
    it("serializes a 16-byte trailer with version as the last byte", () => {
        const t = serializeFrameV2Trailer(iv12(0xab), 7, 10, FRAME_V2_FLAG_KEYFRAME);
        expect(t.length).toBe(FRAME_V2_TRAILER_LENGTH);
        expect(t[15]).toBe(FRAME_V2_VERSION); // version last
        expect(t[14]).toBe(FRAME_V2_FLAG_KEYFRAME); // flags
        expect(t[13]).toBe(10); // clearLen
        expect(t[12]).toBe(7); // epoch
        expect(bytesEqual(t.slice(0, 12), iv12(0xab))); // prefix∥counter
    });

    it("round-trips through parse", () => {
        const iv = iv12(0x5a);
        const trailer = serializeFrameV2Trailer(iv, 200, 3, 0);
        // Frame = codecHeader(3) + ciphertext(20) + trailer(16).
        const frame = new Uint8Array(3 + 20 + FRAME_V2_TRAILER_LENGTH);
        frame.set(trailer, 3 + 20);

        const parsed = parseFrameV2Trailer(frame.buffer);
        expect(parsed).not.toBeNull();
        expect(parsed!.epoch).toBe(200);
        expect(parsed!.clearLen).toBe(3);
        expect(parsed!.flags).toBe(0);
        expect(bytesEqual(parsed!.iv, iv)).toBe(true);
        expect(bytesEqual(parsed!.trailer, trailer)).toBe(true);
    });

    it("returns null when the last byte is not the v2 version marker", () => {
        const buf = new Uint8Array(40).fill(0x99); // last byte 0x99 != 2
        expect(parseFrameV2Trailer(buf.buffer)).toBeNull();
    });

    it("returns null when shorter than a trailer", () => {
        const buf = new Uint8Array(FRAME_V2_TRAILER_LENGTH - 1);
        buf[buf.length - 1] = FRAME_V2_VERSION;
        expect(parseFrameV2Trailer(buf.buffer)).toBeNull();
    });

    it("parse returns copies that survive backing-buffer mutation", () => {
        const trailer = serializeFrameV2Trailer(iv12(0x7c), 1, 1, 0);
        const frame = new Uint8Array(1 + 16 + FRAME_V2_TRAILER_LENGTH);
        frame.set(trailer, 1 + 16);
        const parsed = parseFrameV2Trailer(frame.buffer)!;
        frame.fill(0xff); // clobber the original buffer
        expect(parsed.iv.every((v) => v === 0x7c)).toBe(true);
        expect(parsed.trailer[15]).toBe(FRAME_V2_VERSION);
    });
});

describe("frameV2 full-frame codec", () => {
    it("assembleFrameV2 + parseFrameV2 round-trip", () => {
        const iv = iv12(0x33);
        const codecHeader = new Uint8Array([0xaa, 0xbb]); // clearLen = 2
        const ciphertext = new Uint8Array(20).fill(0x77); // >= 16 (tag)
        const trailer = serializeFrameV2Trailer(iv, 5, codecHeader.length, FRAME_V2_FLAG_KEYFRAME);

        const buf = assembleFrameV2(codecHeader, ciphertext, trailer);
        expect(buf.byteLength).toBe(codecHeader.length + ciphertext.length + FRAME_V2_TRAILER_LENGTH);

        const parsed = parseFrameV2(buf);
        expect(parsed).not.toBeNull();
        expect(bytesEqual(parsed!.codecHeader, codecHeader)).toBe(true);
        expect(bytesEqual(parsed!.ciphertext, ciphertext)).toBe(true);
        expect(bytesEqual(parsed!.iv, iv)).toBe(true);
        expect(parsed!.epoch).toBe(5);
        expect(parsed!.flags).toBe(FRAME_V2_FLAG_KEYFRAME);
        // AAD must be codecHeader ∥ trailer, matching frameV2Aad exactly.
        expect(bytesEqual(parsed!.aad, frameV2Aad(codecHeader, trailer))).toBe(true);
    });

    it("parseFrameV2 returns null for a non-v2 frame", () => {
        const raw = new Uint8Array(40).fill(0x66);
        raw[raw.length - 1] = 99; // version marker != 2
        expect(parseFrameV2(raw.buffer)).toBeNull();
    });

    it("parseFrameV2 rejects an out-of-bounds ClearLen without throwing", () => {
        const iv = iv12();
        // ClearLen 250 cannot fit before the trailer in a 40-byte frame.
        const trailer = serializeFrameV2Trailer(iv, 1, 250, 0);
        const frame = new Uint8Array(40);
        frame.set(trailer, 40 - FRAME_V2_TRAILER_LENGTH);
        expect(parseFrameV2(frame.buffer)).toBeNull();
    });

    it("parseFrameV2 rejects when the ciphertext region is smaller than a GCM tag", () => {
        const iv = iv12();
        // clearLen 0, but only 8 bytes between header and trailer (< 16-byte tag).
        const trailer = serializeFrameV2Trailer(iv, 1, 0, 0);
        const frame = new Uint8Array(8 + FRAME_V2_TRAILER_LENGTH);
        frame.set(trailer, 8);
        expect(parseFrameV2(frame.buffer)).toBeNull();
    });
});
