import { FrameIvGenerator, FRAME_IV_LENGTH_BYTES } from "../FrameIvGenerator.js";

const PREFIX_LEN = 8;
const COUNTER_LEN = FRAME_IV_LENGTH_BYTES - PREFIX_LEN;

function prefixOf(iv: Uint8Array): Uint8Array {
    return iv.slice(0, PREFIX_LEN);
}

function counterOf(iv: Uint8Array): number {
    return new DataView(iv.buffer, iv.byteOffset, iv.byteLength).getUint32(PREFIX_LEN, false);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

describe("FrameIvGenerator", () => {
    it("produces 12-byte IVs", () => {
        const gen = new FrameIvGenerator();
        expect(gen.next().length).toBe(FRAME_IV_LENGTH_BYTES);
        expect(PREFIX_LEN + COUNTER_LEN).toBe(FRAME_IV_LENGTH_BYTES);
    });

    it("keeps the random prefix stable and increments the counter from 0", () => {
        const gen = new FrameIvGenerator();
        const first = gen.next();
        const second = gen.next();
        const third = gen.next();

        // Prefix identical across frames within one session.
        expect(bytesEqual(prefixOf(first), prefixOf(second))).toBe(true);
        expect(bytesEqual(prefixOf(second), prefixOf(third))).toBe(true);

        // Counter is strictly monotonic starting at 0.
        expect(counterOf(first)).toBe(0);
        expect(counterOf(second)).toBe(1);
        expect(counterOf(third)).toBe(2);
    });

    it("uses a fresh random prefix per instance", () => {
        // Two independent instances should (with overwhelming probability) draw
        // different 64-bit prefixes.
        const a = new FrameIvGenerator().next();
        const b = new FrameIvGenerator().next();
        expect(bytesEqual(prefixOf(a), prefixOf(b))).toBe(false);
    });

    it("never repeats an IV over many frames", () => {
        const gen = new FrameIvGenerator();
        const seen = new Set<string>();
        for (let i = 0; i < 100_000; i++) {
            const key = gen.next().join(",");
            expect(seen.has(key)).toBe(false);
            seen.add(key);
        }
    });

    it("returns independent copies (mutating one IV does not affect later ones)", () => {
        const gen = new FrameIvGenerator();
        const first = gen.next();
        first.fill(0xff);
        const second = gen.next();
        // second's counter must be 1, unaffected by mutating first.
        expect(counterOf(second)).toBe(1);
    });

    it("regenerates the prefix and restarts the counter on 32-bit wrap", () => {
        // Seed just below the wrap so we reach it in two calls.
        const gen = new FrameIvGenerator(0xffffffff);

        const atMax = gen.next();
        expect(counterOf(atMax)).toBe(0xffffffff);

        const afterWrap = gen.next();
        // Counter restarts...
        expect(counterOf(afterWrap)).toBe(0);
        // ...under a *new* prefix, so the (prefix,counter) pair is never reused.
        expect(bytesEqual(prefixOf(atMax), prefixOf(afterWrap))).toBe(false);
    });
});
