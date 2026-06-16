/**
 * AES-256 ECB and CBC (no-padding) — the two modes EmCrypto implements with
 * @noble/ciphers (the rest go through WebCrypto). Verified against the
 * authoritative NIST SP 800-38A test vectors, plus encrypt→decrypt round-trips.
 *
 * These methods are invoked by the C++/WASM core through the em_crypto bridge and
 * had no direct coverage before the aes-js → @noble/ciphers swap.
 */
import { getEmCrypto, setGlobalEmCrypto } from "../index.js";

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
const toHex = (b: ArrayBuffer) =>
    [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

// NIST SP 800-38A, F.1.5 / F.2.5 — AES-256.
const KEY = hex("603deb1015ca71be2b73aef0857d7781" + "1f352c073b6108d72d9810a30914dff4");
const IV = hex("000102030405060708090a0b0c0d0e0f");
const PLAINTEXT_HEX = "6bc1bee22e409f96e93d7e117393172a" + "ae2d8a571e03ac9c9eb76fac45af8e51";
const PLAINTEXT = hex(PLAINTEXT_HEX);
const ECB_CIPHERTEXT = "f3eed1bdb5d2a03c064b5a7e3db181f8" + "591ccb10d410ed26dc5ba74a31362870";
const CBC_CIPHERTEXT = "f58c4c04d6e5f1ba779eabfb5f7bfbd6" + "9cfc4e967edb808d679f777bc6702c7d";

describe("AES-256 ECB / CBC (no padding)", () => {
    beforeAll(() => setGlobalEmCrypto());

    it("ECB matches the NIST vector and round-trips", async () => {
        const em = getEmCrypto();
        const ct = await em.aes256EcbEncrypt({ key: KEY, data: PLAINTEXT });
        expect(toHex(ct)).toBe(ECB_CIPHERTEXT);
        const pt = await em.aes256EcbDecrypt({ key: KEY, data: new Uint8Array(ct) });
        expect(toHex(pt)).toBe(PLAINTEXT_HEX);
    });

    it("CBC (no pad) matches the NIST vector and round-trips", async () => {
        const em = getEmCrypto();
        const ct = await em.aes256CbcNoPadEncrypt({ key: KEY, iv: IV, data: PLAINTEXT });
        expect(toHex(ct)).toBe(CBC_CIPHERTEXT);
        const pt = await em.aes256CbcNoPadDecrypt({ key: KEY, iv: IV, data: new Uint8Array(ct) });
        expect(toHex(pt)).toBe(PLAINTEXT_HEX);
    });
});
