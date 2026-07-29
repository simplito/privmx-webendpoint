import { clearHeaderLength } from "../codecHeader.js";

describe("clearHeaderLength", () => {
    it("audio frames keep a 1-byte cleartext header", () => {
        expect(clearHeaderLength("audio")).toBe(1);
        expect(clearHeaderLength("audio", undefined)).toBe(1);
    });

    it("video frames use the VP8 uncompressed-header sizes", () => {
        expect(clearHeaderLength("video", "key")).toBe(10);
        expect(clearHeaderLength("video", "delta")).toBe(3);
        expect(clearHeaderLength("video", "empty")).toBe(1);
    });

    it("video with a missing/unknown type yields 0 (encrypt everything)", () => {
        expect(clearHeaderLength("video")).toBe(0);
        expect(clearHeaderLength("video", "bogus" as never)).toBe(0);
    });

    it("any non-video kind is treated as audio", () => {
        expect(clearHeaderLength("data")).toBe(1);
    });
});
