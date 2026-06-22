import { CryptoFacade } from "../CryptoFacade.js";
import { setGlobalEmCrypto } from "../index.js";

describe("Crypto Robustness: Stale Handle Recovery", () => {
    beforeAll(async () => {
        setGlobalEmCrypto();
    });

    it("should recover when a key handle is manually unregistered from JS registry", async () => {
        const keyBytes = new Uint8Array(32).fill(7);
        const iv = new Uint8Array(12).fill(0);
        const aad = new Uint8Array(0);
        const data = new TextEncoder().encode("robustness test");

        // 1. Initial import and use
        const keyId = await CryptoFacade.importKeyAndWipeMaterial(keyBytes, "AES-GCM", [
            "encrypt",
            "decrypt",
        ]);
        const encrypted1 = await CryptoFacade.aeadEncrypt(keyId, iv, aad, data);
        expect(encrypted1).toBeDefined();

        // 2. Manually unregister the key behind facade's back
        CryptoFacade.unregisterKey(keyId);

        // 3. Using the evicted keyId must throw
        await expect(CryptoFacade.aeadEncrypt(keyId, iv, aad, data)).rejects.toThrow(/not found/);

        // 4. Re-importing the same bytes yields a fresh key ID that still produces the same ciphertext
        const keyId2 = await CryptoFacade.importKeyAndWipeMaterial(keyBytes, "AES-GCM", [
            "encrypt",
            "decrypt",
        ]);
        const encrypted2 = await CryptoFacade.aeadEncrypt(keyId2, iv, aad, data);
        expect(encrypted2).toEqual(encrypted1);
    });
});
