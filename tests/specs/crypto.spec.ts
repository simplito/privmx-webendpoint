import type { Endpoint } from "../../src";
import { test } from "../fixtures";
import { expect } from "@playwright/test";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

const CRYPTO_VECTORS = {
    pbkdf2: {
        password: "pass",
        salt: "salt",
        expectedWIF: "L2TUveYrXgohLcLVcvrYd48Nwy25cZNGEuGYjxwWnai2uW9KNpPb",
    },
    derivePublic: {
        inputWIF: "L2TUveYrXgohLcLVcvrYd48Nwy25cZNGEuGYjxwWnai2uW9KNpPb",
        expectedBase58: "8Qsc1FF9xQp3ziWLEVpAoAp4RcpBpiQ4E9oBbuKfwdqRC5KpHq",
    },
    pem: {
        key: `-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIDn+OxAnJ2hpn6DvIKPd7pZP7+icpLeob5rgkfqhhvvgoAoGCCqGSM49\nAwEHoUQDQgAEpjMTeBBo5FaUueJ2xdkVNDaxYYnl3PGkUMvlel20gGLuQJ8PubAd\nUEgv4yQFIxwLTNp7QlYqdaQTRbGjAblu9g==\n-----END EC PRIVATE KEY-----\n`,
        expectedWIF: "KyASahKYZjCyKJBB7ixVQbrQ7o56Vxo2PJgCuTL3YLFGBqxfPFAC",
    },
};

const BIP39_DATA = {
    password: "password",
    mnemonic: "segment machine okay tank speak giraffe exercise mixed awkward welcome carry wisdom",
    entropy_hex: "c330b267eedd0cc453d47110df288bfe",
    privatePartAsBase58_withoutPassword:
        "xprv9s21ZrQH143K2S9osSQbnVRZY3fgyJ36oxS35mPEPEkoaEXGRegy8HFavePnVqM6eUd9agxwJyrDmYoJ7BJtbwZrc5S63chmH5rD4rwejUA",
    privatePartAsBase58_withPassword:
        "xprv9s21ZrQH143K3nFYh4axNfWq5k4xn8qspfzzZRS8u6D2awiBfe6Tc8Je3NjhXfz1YbjKCTMqPJUdBieU4k9sbZogccWe4PKHEWdxaVzyZE3",
    publicPartAsBase58_withoutPassword:
        "xpub661MyMwAqRbcEvEGyTwc9dNJ65WBNkkxBBMdt9nqwaHnT2rQyC1Dg5a4mw6gJ1QUBBDq7YguV26kHuJgLNVBL3wBwLzhgUPQ85Er6Tn5Eq2",
    publicPartAsBase58_withPassword:
        "xpub661MyMwAqRbcGGL1o67xjoTZdmuTBbZjBtvbMoqkTRk1Tk3LDBQi9vd7tdKFss79vRWUaX14biVwRDSYzJW4YkmH4LvkGq6zfsSctGxoidd",
    seed_withoutPassword_hex:
        "69aee18924f7e6724a7598d49813cfa4eadd31b7671367c7f6de784479d75e1aa4904a498b75e9bcde322bd1011d205d3051ba43c3b4c3a3296451b1a36044f7",
    seed_withPassword_hex:
        "b4d611c2a1cc7b8fccfb14623fb800bde4764388ff766673dccf54cc4b65d35cbc0ff296dde8b3246075458d75f7c4bc3e2c4242c2d4e1c2268e942f040ae943",
    publicKeyBase58DER_withPassword: "67r77s6cs14ErtuLqCv4cgsHUm7dQTvGKx3Mb5DxSXCAUuPygY",
    publicKeyBase58DERAddress_withPassword: "1NbGbcmEVw8nUsRmfeN6m1GQtJX62BwRyS",
    privateKeyWIF_withPassword: "L4eMAP7f7PSGCY8fNVMv66JDczN6wDnGv4ZL2nwf4kTZxvmtp8D6",
    chainCode_withPassword_hex: "acfe0e248220d8879beb8c2ba570098b118a5e3b20912cbcdb073422ca96fbd3",
};

test.describe("CryptoTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    test("Signing Data", async ({ page }) => {
        await page.evaluate(async () => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            await cryptoApi.signData(
                new TextEncoder().encode("data"),
                "KyASahKYZjCyKJBB7ixVQbrQ7o56Vxo2PJgCuTL3YLFGBqxfPFAC",
            );
        });
    });

    test("Verifying signature after signing it", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const cryptoApi = await window.Endpoint.createCryptoApi();

            const dataToVerify = new TextEncoder().encode("data");
            const privateKey = "KyASahKYZjCyKJBB7ixVQbrQ7o56Vxo2PJgCuTL3YLFGBqxfPFAC";
            const publicKey = await cryptoApi.derivePublicKey(privateKey);

            const signature = await cryptoApi.signData(dataToVerify, privateKey);

            const verified = await cryptoApi.verifySignature(dataToVerify, signature, publicKey);
            return { verified };
        });

        expect(result.verified).toBe(true);
    });

    test("Generating new private key", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const key = await cryptoApi.generatePrivateKey();
            return { key }; // Usually returns WIF string
        });
        expect(result.key).toHaveLength(52);
    });

    test("Deriving private Key form password and salt", async ({ page }) => {
        const { password, salt, expectedWIF } = CRYPTO_VECTORS.pbkdf2;

        const result = await page.evaluate(
            async ({ pass, salt }) => {
                const cryptoApi = await window.Endpoint.createCryptoApi();
                const keyInWIF = await cryptoApi.derivePrivateKey(pass, salt);
                return { keyInWIF };
            },
            { pass: password, salt: salt },
        );

        expect(result.keyInWIF).toEqual(expectedWIF);
    });

    test("Deriving public key form private Key", async ({ page }) => {
        const { inputWIF, expectedBase58 } = CRYPTO_VECTORS.derivePublic;

        const result = await page.evaluate(async (wif) => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const keyInBase58DER = await cryptoApi.derivePublicKey(wif);
            return { keyInBase58DER };
        }, inputWIF);

        expect(result.keyInBase58DER).toEqual(expectedBase58);
    });

    test("Generating symmetric key", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const key = await cryptoApi.generateKeySymmetric();
            // Symmetric key is usually a specific object/class in PrivMX WASM
            // We return a simple check or the stringified representation
            return { isObject: typeof key === "object" && key !== null };
        });
        expect(result.isObject).toBe(true);
    });

    test("Encrypt and decrypting data using symmetric key", async ({ page }) => {
        const dataToEncrypt = "abcabcabc";

        const result = await page.evaluate(async (text) => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const key = await cryptoApi.generateKeySymmetric();

            const encryptedData = await cryptoApi.encryptDataSymmetric(
                new TextEncoder().encode(text),
                key,
            );

            // Decrypt returns Uint8Array, we decode it back to string inside browser
            const decryptedUint8 = await cryptoApi.decryptDataSymmetric(encryptedData, key);
            const decryptedData = new TextDecoder().decode(decryptedUint8);

            return { decryptedData };
        }, dataToEncrypt);

        expect(result.decryptedData).toEqual(dataToEncrypt);
    });

    test("Converting private Key form PEM format to WIF format", async ({ page }) => {
        const { key, expectedWIF } = CRYPTO_VECTORS.pem;

        const result = await page.evaluate(async (pem) => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const keyAsWIF = await cryptoApi.convertPEMKeytoWIFKey(pem);
            return { keyAsWIF };
        }, key);

        expect(result.keyAsWIF).toEqual(expectedWIF);
    });

    // =========================================================================
    // BIP39 SUITE
    // =========================================================================

    test("Generating BIP39 key", async ({ page }) => {
        await page.evaluate(async (pass) => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            await cryptoApi.generateBip39(128, pass);
        }, BIP39_DATA.password);
    });

    test("Deriving BIP39 key form Mnemonic", async ({ page }) => {
        const result = await page.evaluate(async (data) => {
            const Endpoint = window.Endpoint;
            const cryptoApi = await Endpoint.createCryptoApi();

            // Helpers for Hex conversion inside Browser
            const toHex = (arr: Uint8Array) =>
                Array.from(arr)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");

            const bip39 = await cryptoApi.fromMnemonic(data.mnemonic);
            const bip39_p = await cryptoApi.fromMnemonic(data.mnemonic, data.password);

            return {
                bip39_entropy_hex: toHex(bip39.entropy),
                bip39_p_entropy_hex: toHex(bip39_p.entropy),
                bip39_PrivatePartAsBase58: await bip39.extKey.getPrivatePartAsBase58(),
                bip39_p_PrivatePartAsBase58: await bip39_p.extKey.getPrivatePartAsBase58(),
            };
        }, BIP39_DATA);

        expect(result.bip39_entropy_hex).toEqual(BIP39_DATA.entropy_hex);
        expect(result.bip39_p_entropy_hex).toEqual(BIP39_DATA.entropy_hex);

        if (BIP39_DATA.privatePartAsBase58_withoutPassword) {
            expect(result.bip39_PrivatePartAsBase58).toEqual(
                BIP39_DATA.privatePartAsBase58_withoutPassword,
            );
            expect(result.bip39_p_PrivatePartAsBase58).toEqual(
                BIP39_DATA.privatePartAsBase58_withPassword,
            );
        }
    });

    test("Deriving BIP39 key form Entropy", async ({ page }) => {
        const result = await page.evaluate(async (data) => {
            const cryptoApi = await window.Endpoint.createCryptoApi();

            const fromHex = (hex: string) =>
                new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
            const BIP39_entropy_UInt8 = fromHex(data.entropy_hex);
            const bip39 = await cryptoApi.fromEntropy(BIP39_entropy_UInt8);
            const bip39_p = await cryptoApi.fromEntropy(BIP39_entropy_UInt8, data.password);
            const private_part_1 = await bip39.extKey.getPrivatePartAsBase58();
            const private_part_2 = await bip39_p.extKey.getPrivatePartAsBase58();
            return {
                bip39_mnemonic: bip39.mnemonic,
                bip39_p_mnemonic: bip39_p.mnemonic,
                bip39_PrivatePartAsBase58: private_part_1,
                bip39_p_PrivatePartAsBase58: private_part_2,
            };
        }, BIP39_DATA);

        expect(result.bip39_mnemonic).toEqual(BIP39_DATA.mnemonic);
        expect(result.bip39_p_mnemonic).toEqual(BIP39_DATA.mnemonic);
    });

    test("Converting BIP39 Entropy To Mnemonic", async ({ page }) => {
        const result = await page.evaluate(async (data) => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const fromHex = (hex: string) =>
                new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

            const BIP39_entropy_UInt8 = fromHex(data.entropy_hex);
            const mnemonic = await cryptoApi.entropyToMnemonic(BIP39_entropy_UInt8);
            return { mnemonic };
        }, BIP39_DATA);

        expect(result.mnemonic).toEqual(BIP39_DATA.mnemonic);
    });

    test("Converting BIP39 Mnemonic To Entropy", async ({ page }) => {
        const result = await page.evaluate(async (data) => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const toHex = (arr: Uint8Array) =>
                Array.from(arr)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");

            const entropy = await cryptoApi.mnemonicToEntropy(data.mnemonic);
            return { entropy_hex: toHex(entropy) };
        }, BIP39_DATA);

        expect(result.entropy_hex).toEqual(BIP39_DATA.entropy_hex);
    });

    test("Converting BIP39 Mnemonic To Seed", async ({ page }) => {
        const result = await page.evaluate(async (data) => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const toHex = (arr: Uint8Array) =>
                Array.from(arr)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");

            const seed_withoutPassword = await cryptoApi.mnemonicToSeed(data.mnemonic);
            const seed_withPassword = await cryptoApi.mnemonicToSeed(data.mnemonic, data.password);

            return {
                seed_withoutPassword_hex: toHex(seed_withoutPassword),
                seed_withPassword_hex: toHex(seed_withPassword),
            };
        }, BIP39_DATA);

        expect(result.seed_withoutPassword_hex).toEqual(BIP39_DATA.seed_withoutPassword_hex);
        expect(result.seed_withPassword_hex).toEqual(BIP39_DATA.seed_withPassword_hex);
    });

    test("Deriving Hardened from BIP39 Key", async ({ page }) => {
        const result = await page.evaluate(async (data) => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const bip39 = await cryptoApi.fromMnemonic(data.mnemonic, data.password);

            // WASM Objects must be handled within browser
            const derived1 = await bip39.extKey.derive(8);
            const derived2 = await bip39.extKey.derive(8);

            const hardened1 = await bip39.extKey.deriveHardened(8);
            const hardened2 = await bip39.extKey.deriveHardened(8);

            return {
                derived1_base58: await derived1.getPrivatePartAsBase58(),
                derived2_base58: await derived2.getPrivatePartAsBase58(),
                hardened1_base58: await hardened1.getPrivatePartAsBase58(),
                hardened2_base58: await hardened2.getPrivatePartAsBase58(),
            };
        }, BIP39_DATA);

        expect(result.derived1_base58).toEqual(result.derived2_base58);
        expect(result.hardened1_base58).toEqual(result.hardened2_base58);
        expect(result.derived1_base58).not.toEqual(result.hardened1_base58);
    });

    test("BIP39 getters verification (Private/Public/ChainCode)", async ({ page }) => {
        const result = await page.evaluate(async (data) => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const toHex = (arr: Uint8Array) =>
                Array.from(arr)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");

            const bip39 = await cryptoApi.fromMnemonic(data.mnemonic, data.password);

            return {
                privatePartBase58: await bip39.extKey.getPrivatePartAsBase58(),
                publicPartBase58: await bip39.extKey.getPublicPartAsBase58(),
                privateKeyWIF: await bip39.extKey.getPrivateKey(),
                publicKeyBase58: await bip39.extKey.getPublicKey(),
                publicKeyAddress: await bip39.extKey.getPublicKeyAsBase58Address(),
                chainCodeHex: toHex(await bip39.extKey.getChainCode()),
            };
        }, BIP39_DATA);

        expect(result.privatePartBase58).toBeDefined();
        expect(result.publicPartBase58).toBeDefined();
        expect(result.privateKeyWIF).toHaveLength(52); // Standard WIF length
        expect(result.chainCodeHex).toHaveLength(64); // 32 bytes hex

        if (BIP39_DATA.chainCode_withPassword_hex) {
            expect(result.chainCodeHex).toEqual(BIP39_DATA.chainCode_withPassword_hex);
        }
    });

    test("Stale Handle Recovery - Driver Level", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const key = new Uint8Array(32).fill(11);
            const data = new Uint8Array([1, 2, 3]);

            // 1. First call - populates driver-side cache and JS registry
            await cryptoApi.encryptDataSymmetric(data, key);

            // 2. Simulate manual cleanup in JS (as if from CryptoFacade)
            // C++ driver still has the handle in its keyToHandleMap.
            const emCrypto = (window as any).em_crypto;
            const keys = emCrypto.keys;
            const lastId = Array.from(keys.keys()).pop() as string;
            emCrypto.unregisterKey({ id: lastId });

            // 3. Second call - C++ uses cached handle, JS throws 'not found', C++ retries.
            const enc2 = await cryptoApi.encryptDataSymmetric(data, key);
            return { enc2: Array.from(enc2) };
        });
        expect(result.enc2).toBeDefined();
    });

    test("Concurrency Stress Test - 1000 parallel AES encrypt/decrypt cycles", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const key = new Uint8Array(32).fill(12);
            const originalText = "concurrency-check-123";
            const data = new TextEncoder().encode(originalText);

            // 1. Parallel Encryption
            const encPromises = [];
            for (let i = 0; i < 1000; i++) {
                encPromises.push(cryptoApi.encryptDataSymmetric(data, key));
            }
            const ciphertexts = await Promise.all(encPromises);

            // 2. Parallel Decryption
            const decPromises = ciphertexts.map((ct) => cryptoApi.decryptDataSymmetric(ct, key));
            const decryptedBuffers = await Promise.all(decPromises);

            // 3. Verification
            const decoder = new TextDecoder();
            const allMatch = decryptedBuffers.every((buf) => decoder.decode(buf) === originalText);

            return { count: decryptedBuffers.length, allMatch };
        });
        expect(result.count).toBe(1000);
        expect(result.allMatch).toBe(true);
    });

    // =========================================================================
    // CryptoFacade (em_crypto) vs CryptoApi (WASM) sign/verify compatibility
    //
    // The WASM C++ layer delegates its crypto primitives to em_crypto, so both
    // layers share the same secp256k1 implementation. They differ in key encoding
    // (WIF / BASE58DER vs raw bytes) and hashing (CryptoApi hashes internally;
    // em_crypto.eccSign/eccVerify operate on pre-hashed 32-byte input).
    // =========================================================================

    test.describe("ECC sign/verify: round-trip", () => {
        test("EmCrypto (CryptoFacade): sign and verify succeed", async ({ page }) => {
            const result = await page.evaluate(async () => {
                const em = (window as any).em_crypto;
                const { privateKey, publicKey } = await em.eccGenPair();
                const data = new TextEncoder().encode("emcrypto round-trip");
                // eccSign / eccVerify require exactly 32-byte pre-hashed input
                const hash = new Uint8Array(await em.sha256({ data }));
                const sig = new Uint8Array(await em.eccSign({ privateKey, data: hash }));
                const verified: boolean = await em.eccVerify({ publicKey, data: hash, signature: sig });
                return { verified };
            });
            expect(result.verified).toBe(true);
        });

        test("CryptoApi (WASM): sign and verify succeed", async ({ page }) => {
            const result = await page.evaluate(async () => {
                const cryptoApi = await window.Endpoint.createCryptoApi();
                const wif = await cryptoApi.generatePrivateKey();
                const pub = await cryptoApi.derivePublicKey(wif);
                const data = new TextEncoder().encode("cryptoapi round-trip");
                const sig = await cryptoApi.signData(data, wif);
                const verified: boolean = await cryptoApi.verifySignature(data, sig, pub);
                return { verified };
            });
            expect(result.verified).toBe(true);
        });
    });

    test.describe("ECC sign/verify: cross-layer compatibility", () => {
        // CryptoApi.signData hashes internally (SHA-256) then calls em_crypto.ecc_sign.
        // The signature is over SHA-256(data) in [recovery|r|s] format — identical to
        // what em_crypto.eccVerify expects when given the same pre-hashed data.
        test("CryptoApi (WASM) sign → EmCrypto (CryptoFacade) verify", async ({ page }) => {
            const result = await page.evaluate(async () => {
                const cryptoApi = await window.Endpoint.createCryptoApi();
                const em = (window as any).em_crypto;
                const wif = await cryptoApi.generatePrivateKey();

                // WIF = base58check( 0x80 | privkey32 | 0x01 ).
                // Slice [1, 33) strips the version prefix; the 4-byte checksum at the
                // end does not interfere with this slice.
                const base58Decode = (s: string): Uint8Array => {
                    const alpha = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
                    let n = 0n;
                    for (const c of s) n = n * 58n + BigInt(alpha.indexOf(c));
                    let hex = n.toString(16);
                    if (hex.length % 2) hex = "0" + hex;
                    const bytes = Uint8Array.from(
                        (hex.match(/.{2}/g) as string[]).map((b) => parseInt(b, 16)),
                    );
                    let lead = 0;
                    for (const c of s) {
                        if (c !== "1") break;
                        lead++;
                    }
                    const out = new Uint8Array(lead + bytes.length);
                    out.set(bytes, lead);
                    return out;
                };

                const rawPrivKey = base58Decode(wif).slice(1, 33);
                const { publicKey: rawPubKey } = await em.eccFromPrivateKey({ key: rawPrivKey });
                const rawData = new TextEncoder().encode("wasm-sign / js-verify");
                const sig = new Uint8Array(await cryptoApi.signData(rawData, wif));
                const hash = new Uint8Array(await em.sha256({ data: rawData }));
                const verified: boolean = await em.eccVerify({
                    publicKey: rawPubKey,
                    data: hash,
                    signature: sig,
                });
                return { verified };
            });
            expect(result.verified).toBe(true);
        });

        // em_crypto.eccSign signs SHA-256(data) in [recovery|r|s] format.
        // CryptoApi.verifySignature re-hashes rawData internally before verifying.
        test("EmCrypto (CryptoFacade) sign → CryptoApi (WASM) verify", async ({ page }) => {
            const result = await page.evaluate(async () => {
                const cryptoApi = await window.Endpoint.createCryptoApi();
                const em = (window as any).em_crypto;
                const { privateKey: rawPrivKey } = await em.eccGenPair();

                // Encode raw key as compressed WIF so CryptoApi can derive the
                // BASE58DER public key. WIF = base58check( 0x80 | rawKey32 | 0x01 ).
                const rawToWIF = async (raw: Uint8Array): Promise<string> => {
                    const alpha = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
                    const payload = new Uint8Array([0x80, ...raw, 0x01]);
                    const h1 = new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
                    const h2 = new Uint8Array(await crypto.subtle.digest("SHA-256", h1));
                    const full = new Uint8Array([...payload, ...h2.slice(0, 4)]);
                    let n = BigInt(
                        "0x" + Array.from(full).map((b) => b.toString(16).padStart(2, "0")).join(""),
                    );
                    let r = "";
                    while (n > 0n) {
                        const rem = n % 58n;
                        n /= 58n;
                        r = alpha[Number(rem)] + r;
                    }
                    for (const b of full) {
                        if (b !== 0) break;
                        r = "1" + r;
                    }
                    return r;
                };

                const wif = await rawToWIF(rawPrivKey);
                const base58DerPubKey = await cryptoApi.derivePublicKey(wif);
                const rawData = new TextEncoder().encode("js-sign / wasm-verify");
                const hash = new Uint8Array(await em.sha256({ data: rawData }));
                const sig = new Uint8Array(await em.eccSign({ privateKey: rawPrivKey, data: hash }));
                const verified: boolean = await cryptoApi.verifySignature(rawData, sig, base58DerPubKey);
                return { verified };
            });
            expect(result.verified).toBe(true);
        });
    });

    test.describe("ECC sign/verify: rejection", () => {
        test("EmCrypto rejects a signature with a flipped byte", async ({ page }) => {
            const result = await page.evaluate(async () => {
                const em = (window as any).em_crypto;
                const { privateKey, publicKey } = await em.eccGenPair();
                const hash = new Uint8Array(
                    await em.sha256({ data: new TextEncoder().encode("tamper-js") }),
                );
                const sig = new Uint8Array(await em.eccSign({ privateKey, data: hash }));
                sig[32] ^= 0xff;
                const verified: boolean = await em.eccVerify({ publicKey, data: hash, signature: sig });
                return { verified };
            });
            expect(result.verified).toBe(false);
        });

        test("CryptoApi (WASM) rejects a tampered signature", async ({ page }) => {
            const result = await page.evaluate(async () => {
                const cryptoApi = await window.Endpoint.createCryptoApi();
                const wif = await cryptoApi.generatePrivateKey();
                const pub = await cryptoApi.derivePublicKey(wif);
                const data = new TextEncoder().encode("tamper-wasm");
                const sig = new Uint8Array(await cryptoApi.signData(data, wif));
                sig[32] ^= 0xff;
                const verified: boolean = await cryptoApi.verifySignature(data, sig, pub);
                return { verified };
            });
            expect(result.verified).toBe(false);
        });

        test("EmCrypto rejects a valid signature verified against the wrong public key", async ({
            page,
        }) => {
            const result = await page.evaluate(async () => {
                const em = (window as any).em_crypto;
                const { privateKey } = await em.eccGenPair();
                const { publicKey: wrongPub } = await em.eccGenPair();
                const hash = new Uint8Array(
                    await em.sha256({ data: new TextEncoder().encode("wrong-key-js") }),
                );
                const sig = new Uint8Array(await em.eccSign({ privateKey, data: hash }));
                const verified: boolean = await em.eccVerify({
                    publicKey: wrongPub,
                    data: hash,
                    signature: sig,
                });
                return { verified };
            });
            expect(result.verified).toBe(false);
        });

        test("CryptoApi (WASM) rejects a signature from a different key pair", async ({ page }) => {
            const result = await page.evaluate(async () => {
                const cryptoApi = await window.Endpoint.createCryptoApi();
                const signerWIF = await cryptoApi.generatePrivateKey();
                const verifierWIF = await cryptoApi.generatePrivateKey();
                const verifierPub = await cryptoApi.derivePublicKey(verifierWIF);
                const data = new TextEncoder().encode("wrong-key-wasm");
                const sig = await cryptoApi.signData(data, signerWIF);
                const verified: boolean = await cryptoApi.verifySignature(data, sig, verifierPub);
                return { verified };
            });
            expect(result.verified).toBe(false);
        });
    });
});
