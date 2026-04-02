import { CryptoFacade } from "../CryptoFacade";
import { setGlobalEmCrypto } from "../index";

describe("Crypto Performance Benchmarks", () => {
    beforeAll(async () => {
        setGlobalEmCrypto();
    });

    it("should demonstrate CryptoKey reuse performance via importKey", async () => {
        const keyBytes = new Uint8Array(32).fill(1);
        const iv = new Uint8Array(12).fill(2);
        const aad = new Uint8Array([1, 2, 3, 4]);
        const data = new Uint8Array(1024).fill(0);
        const iterations = 500;

        // CryptoKey reuse via importKey
        const keyId = await CryptoFacade.importKey(keyBytes, "AES-GCM", ["encrypt", "decrypt"]);
        const startKey = performance.now();
        for (let i = 0; i < iterations; i++) {
            await CryptoFacade.aeadEncrypt(keyId, iv, aad, data);
        }
        const endKey = performance.now();
        const keyTime = endKey - startKey;

        console.log(`AEAD Performance (${iterations} iterations, 1KB data):`);
        console.log(`CryptoKey Reuse (registry):    ${keyTime.toFixed(2)}ms`);
        console.log(`Avg per operation:             ${(keyTime / iterations).toFixed(3)}ms`);

        // Should complete in reasonable time
        expect(keyTime).toBeLessThan(30000);

        // Clean up
        CryptoFacade.unregisterKey(keyId);
    });

    it("should verify Key Scrubbing (wipe) works via internal EmCrypto path", async () => {
        const { getEmCrypto } = require("../index");
        const emCrypto = getEmCrypto();

        const keyBytes = new Uint8Array(32).fill(0xff);
        const iv = new Uint8Array(12).fill(0);
        const aad = new Uint8Array(0);
        const data = new Uint8Array(16).fill(0);

        // Check if all are 0xFF
        expect(keyBytes.every((b: number) => b === 0xff)).toBe(true);

        // Use internal EmCrypto directly (wipe is an internal feature)
        await emCrypto.aeadEncrypt({ key: keyBytes, iv, aad, data, wipe: true });

        // Check if all are 0x00 now
        expect(keyBytes.every((b: number) => b === 0)).toBe(true);
    });
});
