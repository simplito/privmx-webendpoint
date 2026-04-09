import { CryptoFacade } from "../CryptoFacade";
import { setGlobalEmCrypto, getEmCrypto } from "../index";

describe("Crypto Performance Benchmarks", () => {
    beforeAll(async () => {
        setGlobalEmCrypto();
    });

    it("should compare AEAD performance: raw bytes vs CryptoKey reuse", async () => {
        const keyBytes = new Uint8Array(32).fill(1);
        const iv = new Uint8Array(12).fill(2);
        const aad = new Uint8Array([1, 2, 3, 4]);
        const data = new Uint8Array(1024).fill(0);
        const iterations = 500;

        // 1. Raw Bytes (repeated import)
        const startRaw = performance.now();
        for (let i = 0; i < iterations; i++) {
            await getEmCrypto().aeadEncrypt({ key: keyBytes, iv, aad, data });
        }
        const endRaw = performance.now();
        const rawTime = endRaw - startRaw;

        // 2. CryptoKey reuse
        const keyId = await CryptoFacade.importKeyAndWipeMaterial(keyBytes, "AES-GCM", ["encrypt", "decrypt"]);
        const startKey = performance.now();
        for (let i = 0; i < iterations; i++) {
            await CryptoFacade.aeadEncrypt(keyId, iv, aad, data);
        }
        const endKey = performance.now();
        const keyTime = endKey - startKey;

        console.log(`AEAD Performance (${iterations} iterations, 1KB data):`);
        console.log(`Raw Bytes (import every time): ${rawTime.toFixed(2)}ms`);
        console.log(`CryptoKey Reuse (registry):    ${keyTime.toFixed(2)}ms`);
        console.log(`Speedup:                       ${(rawTime / keyTime).toFixed(2)}x`);

        expect(keyTime).toBeLessThan(rawTime);

        // Clean up
        CryptoFacade.unregisterKey(keyId);
    });

    it("should always wipe raw key bytes after use", async () => {
        const keyBytes = new Uint8Array(32).fill(0xff);
        const iv = new Uint8Array(12).fill(0);
        const aad = new Uint8Array(0);
        const data = new Uint8Array(16).fill(0);

        expect(keyBytes.every((b) => b === 0xff)).toBe(true);
        await getEmCrypto().aeadEncrypt({ key: keyBytes, iv, aad, data });
        expect(keyBytes.every((b) => b === 0)).toBe(true);
    });
});
