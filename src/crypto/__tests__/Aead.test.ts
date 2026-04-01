import { CryptoFacade } from "../CryptoFacade";
import { setGlobalEmCrypto } from "../index";
import { EmCrypto } from "../EmCrypto";

describe("AEAD (AES-GCM) Tests", () => {
    beforeAll(async () => {
        setGlobalEmCrypto();
    });

    it("should encrypt and decrypt correctly with AAD", async () => {
        const key = new Uint8Array(32).fill(1);
        const iv = new Uint8Array(12).fill(2);
        const aad = new Uint8Array([1, 2, 3, 4]);
        const data = new Uint8Array([10, 20, 30, 40, 50]);

        const encrypted = await CryptoFacade.aeadEncrypt(key, iv, aad, data);
        expect(encrypted.byteLength).toBe(data.length + 16);

        const ciphertext = new Uint8Array(encrypted).slice(0, data.length);
        const tag = new Uint8Array(encrypted).slice(data.length);

        const decrypted = await CryptoFacade.aeadDecrypt(key, iv, aad, ciphertext, tag);
        expect(new Uint8Array(decrypted)).toEqual(data);
    });

    it("should encrypt and decrypt correctly without AAD", async () => {
        const key = new Uint8Array(32).fill(3);
        const iv = new Uint8Array(12).fill(4);
        const aad = new Uint8Array(0);
        const data = new TextEncoder().encode("Hello AEAD!");

        const encrypted = await CryptoFacade.aeadEncrypt(key, iv, aad, data);
        const ciphertext = new Uint8Array(encrypted).slice(0, data.length);
        const tag = new Uint8Array(encrypted).slice(data.length);

        const decrypted = await CryptoFacade.aeadDecrypt(key, iv, aad, ciphertext, tag);
        expect(new TextDecoder().decode(decrypted)).toBe("Hello AEAD!");
    });

    it("should fail decryption if tag is tampered", async () => {
        const key = new Uint8Array(32).fill(5);
        const iv = new Uint8Array(12).fill(6);
        const aad = new Uint8Array(0);
        const data = new Uint8Array([1, 2, 3]);

        const encrypted = await CryptoFacade.aeadEncrypt(key, iv, aad, data);
        const ciphertext = new Uint8Array(encrypted).slice(0, data.length);
        const tag = new Uint8Array(encrypted).slice(data.length);

        tag[0] ^= 0xff; // Tamper tag

        await expect(CryptoFacade.aeadDecrypt(key, iv, aad, ciphertext, tag)).rejects.toThrow();
    });

    it("should fail decryption if AAD is tampered", async () => {
        const key = new Uint8Array(32).fill(7);
        const iv = new Uint8Array(12).fill(8);
        const aad = new Uint8Array([1, 2, 3]);
        const data = new Uint8Array([4, 5, 6]);

        const encrypted = await CryptoFacade.aeadEncrypt(key, iv, aad, data);
        const ciphertext = new Uint8Array(encrypted).slice(0, data.length);
        const tag = new Uint8Array(encrypted).slice(data.length);

        const wrongAad = new Uint8Array([1, 2, 4]); // Tamper AAD

        await expect(
            CryptoFacade.aeadDecrypt(key, iv, wrongAad, ciphertext, tag),
        ).rejects.toThrow();
    });
});
