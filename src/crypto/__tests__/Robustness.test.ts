import { CryptoFacade } from "../CryptoFacade";
import { setGlobalEmCrypto } from "../index";

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
        const keyId = await CryptoFacade.importKeyAndWipeMaterial(keyBytes, "AES-GCM", ["encrypt", "decrypt"]);
        const encrypted1 = await CryptoFacade.aeadEncrypt(keyId, iv, aad, data);
        expect(encrypted1).toBeDefined();

        // 2. Manually unregister the key behind facade's back
        CryptoFacade.unregisterKey(keyId);

        // 3. Attempt to use the same keyId again
        // Facade should throw "not found", but if we pass the RAW BYTES again,
        // the driver (if we were in WASM) would recover.
        // In pure JS, CryptoFacade.aeadEncrypt(keyId, ...) will fail if keyId is unknown.

        await expect(CryptoFacade.aeadEncrypt(keyId, iv, aad, data)).rejects.toThrow(/not found/);

        // 4. Test automatic recovery when passing raw bytes again (mimicking driver behavior)
        // High level API doesn't have automatic "re-import on failure" for handles yet,
        // but the C++ driver DOES.
        // Let's verify that re-importing with same bytes works and doesn't conflict.
        const keyId2 = await CryptoFacade.importKeyAndWipeMaterial(keyBytes, "AES-GCM", ["encrypt", "decrypt"]);
        const encrypted2 = await CryptoFacade.aeadEncrypt(keyId2, iv, aad, data);
        expect(encrypted2).toEqual(encrypted1);
    });
});
