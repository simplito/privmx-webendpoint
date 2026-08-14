import { setGlobalEmCrypto } from "../../../crypto/index.js";
import { KeyStore } from "../../KeyStore.js";
import { Key } from "../../../Types.js";
import { EncryptTransform, RTCEncodedVideoFrameType } from "../EncryptTransform.js";
import { FRAME_V2_VERSION } from "../frameV2.js";

// ---- helpers ----------------------------------------------------------------

/** Fake RTCEncodedAudioFrame / RTCEncodedVideoFrame backed by a plain ArrayBuffer. */
function makeFrame(
    body: number[],
    headerSize: number,
): {
    data: ArrayBuffer;
    type?: RTCEncodedVideoFrameType;
} {
    const header = new Uint8Array(headerSize).fill(0xaa);
    const payload = new Uint8Array(body);
    const buf = new ArrayBuffer(headerSize + body.length);
    new Uint8Array(buf).set(header, 0);
    new Uint8Array(buf).set(payload, headerSize);
    return { data: buf };
}

function makeVideoFrame(
    body: number[],
    type: RTCEncodedVideoFrameType,
): { data: ArrayBuffer; type: RTCEncodedVideoFrameType } {
    const headerSizes: Record<RTCEncodedVideoFrameType, number> = {
        key: 10,
        delta: 3,
        empty: 1,
    };
    return { ...makeFrame(body, headerSizes[type]), type };
}

function makeAudioFrame(body: number[]): { data: ArrayBuffer } {
    return makeFrame(body, 1);
}

/** Minimal TransformStreamDefaultController that records the enqueued frame. */
function makeController(): {
    controller: TransformStreamDefaultController<unknown>;
    enqueued: Array<{ data: ArrayBuffer }>;
} {
    const enqueued: Array<{ data: ArrayBuffer }> = [];
    const controller = {
        enqueue(frame: unknown) {
            enqueued.push(frame as { data: ArrayBuffer });
        },
    } as unknown as TransformStreamDefaultController<unknown>;
    return { controller, enqueued };
}

/** Deep-copy an ArrayBuffer so before/after comparisons are stable. */
function copyBuffer(buf: ArrayBuffer): Uint8Array {
    return new Uint8Array(buf.slice(0));
}

function bufEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
}

// ---- setup ------------------------------------------------------------------

beforeAll(() => {
    setGlobalEmCrypto();
});

/** Build a KeyStore with a single 32-byte type-0 key loaded and return both. */
async function makeKeyStore(keyByte = 0x42): Promise<{ ks: KeyStore; keyBytes: Uint8Array }> {
    const keyBytes = new Uint8Array(32).fill(keyByte);
    const ks = new KeyStore();
    // KeyStore.setKeys wipes the input buffer, so pass a copy; must await (async import)
    await ks.setKeys([{ keyId: `key-${keyByte.toString(16)}`, key: keyBytes.slice(), type: 0 }]);
    return { ks, keyBytes };
}

/** Build a KeyStore holding several keys (for epoch-resolution / rotation tests). */
async function makeMultiKeyStore(
    keys: Array<{ keyId: string; byte: number; type: number }>,
): Promise<KeyStore> {
    const ks = new KeyStore();
    await ks.setKeys(
        keys.map(
            (k): Key => ({ keyId: k.keyId, key: new Uint8Array(32).fill(k.byte), type: k.type }),
        ),
    );
    return ks;
}

// ---- tests ------------------------------------------------------------------

describe("EncryptTransform (v2 wire format)", () => {
    describe("encryptFrame + decryptFrame - audio", () => {
        it("body is not plaintext after encryption", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            const body = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
            const frame = makeAudioFrame(body) as RTCEncodedAudioFrame;
            const originalBody = new Uint8Array(body);

            const { controller, enqueued } = makeController();
            await et.encryptFrame(frame, "audio", controller);

            expect(enqueued).toHaveLength(1);
            const encryptedData = new Uint8Array(enqueued[0].data);

            // Output is larger than input (ciphertext+tag + 16B trailer).
            expect(encryptedData.byteLength).toBeGreaterThan(1 + body.length);
            // Version byte is the last byte of the frame.
            expect(encryptedData[encryptedData.byteLength - 1]).toBe(FRAME_V2_VERSION);

            // Body bytes (after 1B audio header) should differ from original plaintext
            const encryptedBody = encryptedData.slice(1, 1 + body.length);
            expect(bufEqual(encryptedBody, originalBody)).toBe(false);
        });

        it("codec header byte is preserved unencrypted (AAD)", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            const frame = makeAudioFrame([0xde, 0xad, 0xbe, 0xef]) as RTCEncodedAudioFrame;
            const originalHeader = new Uint8Array(frame.data, 0, 1)[0];

            const { controller, enqueued } = makeController();
            await et.encryptFrame(frame, "audio", controller);

            expect(new Uint8Array(enqueued[0].data)[0]).toBe(originalHeader);
        });

        it("decrypts back to the original payload", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            const body = [10, 20, 30, 40, 50, 60, 70, 80];
            const frame = makeAudioFrame(body) as RTCEncodedAudioFrame;

            const { controller: encCtrl, enqueued: encQueued } = makeController();
            await et.encryptFrame(frame, "audio", encCtrl);

            const { controller: decCtrl, enqueued: decQueued } = makeController();
            await et.decryptFrame(encQueued[0] as unknown as RTCEncodedAudioFrame, decCtrl);

            const decrypted = new Uint8Array(decQueued[0].data);
            // 1B header + original body
            expect(decrypted.byteLength).toBe(1 + body.length);
            expect(Array.from(decrypted.slice(1))).toEqual(body);
        });
    });

    describe("encryptFrame + decryptFrame - video", () => {
        it.each<RTCEncodedVideoFrameType>(["key", "delta", "empty"])(
            "%s frame: body is encrypted, header preserved, decrypts correctly",
            async (frameType: RTCEncodedVideoFrameType) => {
                const { ks } = await makeKeyStore(0x55);
                const et = new EncryptTransform(ks);

                const body = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
                const frame = makeVideoFrame(body, frameType) as unknown as RTCEncodedVideoFrame;

                const headerSizes: Record<RTCEncodedVideoFrameType, number> = {
                    key: 10,
                    delta: 3,
                    empty: 1,
                };
                const hLen = headerSizes[frameType];
                const originalHeader = copyBuffer(frame.data).slice(0, hLen);

                const { controller: encCtrl, enqueued: encQueued } = makeController();
                await et.encryptFrame(frame, "video", encCtrl);

                const encryptedData = new Uint8Array(encQueued[0].data);

                // Header is unchanged
                expect(Array.from(encryptedData.slice(0, hLen))).toEqual(
                    Array.from(originalHeader),
                );

                // Body bytes right after header should not be plaintext
                const bodyAfterHeader = encryptedData.slice(hLen, hLen + body.length);
                expect(bufEqual(bodyAfterHeader, new Uint8Array(body))).toBe(false);

                // Decrypt restores original body - reading ClearLen from the trailer,
                // NOT from the frame type (decode is codec-agnostic).
                const { controller: decCtrl, enqueued: decQueued } = makeController();
                await et.decryptFrame(encQueued[0] as unknown as RTCEncodedVideoFrame, decCtrl);
                const decrypted = new Uint8Array(decQueued[0].data);
                expect(Array.from(decrypted.slice(hLen))).toEqual(body);
            },
        );
    });

    describe("key resolution by epoch", () => {
        it("decrypts using a held non-encryption (previous-epoch) key", async () => {
            // Sender's active key is "epoch4"; the receiver holds "epoch5" as its
            // current (type 0) key plus "epoch4" retained (type 1) during rotation.
            const encKs = await makeMultiKeyStore([{ keyId: "epoch4", byte: 0x41, type: 0 }]);
            const decKs = await makeMultiKeyStore([
                { keyId: "epoch5", byte: 0x55, type: 0 },
                { keyId: "epoch4", byte: 0x41, type: 1 },
            ]);

            const body = [9, 8, 7, 6, 5, 4, 3, 2];
            const frame = makeAudioFrame(body) as RTCEncodedAudioFrame;

            const { controller: encCtrl, enqueued: encQueued } = makeController();
            await new EncryptTransform(encKs).encryptFrame(frame, "audio", encCtrl);

            const { controller: decCtrl, enqueued: decQueued } = makeController();
            await new EncryptTransform(decKs).decryptFrame(
                encQueued[0] as unknown as RTCEncodedAudioFrame,
                decCtrl,
            );

            expect(Array.from(new Uint8Array(decQueued[0].data).slice(1))).toEqual(body);
        });
    });

    describe("wrong key - pass-through", () => {
        it("enqueues the frame unchanged when no held key matches the epoch", async () => {
            const { ks: encKs } = await makeKeyStore(0x11);
            const { ks: decKs } = await makeKeyStore(0x22); // different key/id
            const encEt = new EncryptTransform(encKs);
            const decEt = new EncryptTransform(decKs);

            const body = [0xca, 0xfe, 0xba, 0xbe];
            const frame = makeAudioFrame(body) as RTCEncodedAudioFrame;

            const { controller: encCtrl, enqueued: encQueued } = makeController();
            await encEt.encryptFrame(frame, "audio", encCtrl);

            const encryptedSnapshot = copyBuffer(encQueued[0].data);

            const { controller: decCtrl, enqueued: decQueued } = makeController();
            await decEt.decryptFrame(encQueued[0] as unknown as RTCEncodedAudioFrame, decCtrl);

            expect(bufEqual(new Uint8Array(decQueued[0].data), encryptedSnapshot)).toBe(true);
        });
    });

    describe("authentication - AEAD tag failure -> pass-through", () => {
        it("enqueues unchanged when the ciphertext is corrupted", async () => {
            const { ks } = await makeKeyStore(0x33);
            const et = new EncryptTransform(ks);

            const body = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
            const frame = makeAudioFrame(body) as RTCEncodedAudioFrame;

            const { controller: encCtrl, enqueued: encQueued } = makeController();
            await et.encryptFrame(frame, "audio", encCtrl);

            // Flip a byte in the ciphertext (after the 1B audio header).
            const tampered = new Uint8Array(encQueued[0].data.slice(0));
            tampered[2] ^= 0xff;
            encQueued[0].data = tampered.buffer;
            const tamperedSnapshot = copyBuffer(encQueued[0].data);

            const { controller: decCtrl, enqueued: decQueued } = makeController();
            await et.decryptFrame(encQueued[0] as unknown as RTCEncodedAudioFrame, decCtrl);

            expect(decQueued).toHaveLength(1);
            expect(bufEqual(new Uint8Array(decQueued[0].data), tamperedSnapshot)).toBe(true);
        });

        it("enqueues unchanged when a trailer metadata byte is tampered (trailer is AAD)", async () => {
            const { ks } = await makeKeyStore(0x34);
            const et = new EncryptTransform(ks);

            const body = [1, 2, 3, 4, 5, 6, 7, 8];
            const frame = makeAudioFrame(body) as RTCEncodedAudioFrame;

            const { controller: encCtrl, enqueued: encQueued } = makeController();
            await et.encryptFrame(frame, "audio", encCtrl);

            // Flip the Flags byte (2nd from last). Epoch/ClearLen/Version are intact,
            // so the key still resolves - but the AAD changed, so the tag must fail.
            const tampered = new Uint8Array(encQueued[0].data.slice(0));
            tampered[tampered.length - 2] ^= 0xff;
            encQueued[0].data = tampered.buffer;
            const tamperedSnapshot = copyBuffer(encQueued[0].data);

            const { controller: decCtrl, enqueued: decQueued } = makeController();
            await et.decryptFrame(encQueued[0] as unknown as RTCEncodedAudioFrame, decCtrl);

            expect(bufEqual(new Uint8Array(decQueued[0].data), tamperedSnapshot)).toBe(true);
        });
    });

    describe("non-v2 / malformed frames - pass-through, never throw", () => {
        it("passes through a frame whose version byte is not 2", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            const raw = new Uint8Array(40).fill(0x55);
            raw[raw.length - 1] = 99; // not the v2 marker
            const { controller, enqueued } = makeController();
            await et.decryptFrame({ data: raw.slice().buffer } as unknown as RTCEncodedAudioFrame, controller);

            expect(enqueued).toHaveLength(1);
            expect(bufEqual(new Uint8Array(enqueued[0].data), raw)).toBe(true);
        });

        it("passes through a frame too short to hold a trailer", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            const tiny = { data: new Uint8Array([0xaa, 0x01, 0x02]).buffer };
            const { controller, enqueued } = makeController();
            await et.decryptFrame(tiny as unknown as RTCEncodedAudioFrame, controller);

            expect(enqueued).toHaveLength(1);
        });

        it("passes through a v2-shaped frame with an out-of-bounds ClearLen", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            // Version byte set to 2, ClearLen (3rd from last) set huge.
            const raw = new Uint8Array(40).fill(0x00);
            raw[raw.length - 1] = FRAME_V2_VERSION;
            raw[raw.length - 3] = 250; // ClearLen far past the ciphertext region
            const { controller, enqueued } = makeController();
            await et.decryptFrame({ data: raw.slice().buffer } as unknown as RTCEncodedAudioFrame, controller);

            expect(enqueued).toHaveLength(1);
            expect(bufEqual(new Uint8Array(enqueued[0].data), raw)).toBe(true);
        });

        it("never throws on random frames (fuzz)", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            for (let i = 0; i < 500; i++) {
                const raw = new Uint8Array(6 + (i % 250));
                crypto.getRandomValues(raw);
                const rawSnapshot = raw.slice();
                const { controller, enqueued } = makeController();
                await et.decryptFrame(
                    { data: raw.buffer } as unknown as RTCEncodedAudioFrame,
                    controller,
                );
                expect(enqueued).toHaveLength(1);
                expect(bufEqual(new Uint8Array(enqueued[0].data), rawSnapshot)).toBe(true);
            }
        });

        it("encryptFrame passes an empty (sub-header) frame through unchanged", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            const frame = { data: new ArrayBuffer(0) };
            const { controller, enqueued } = makeController();
            await et.encryptFrame(frame as unknown as RTCEncodedAudioFrame, "audio", controller);

            expect(enqueued).toHaveLength(1);
            expect(enqueued[0].data.byteLength).toBe(0);
        });
    });

    describe("multiple sequential encryptions", () => {
        it("each frame gets a unique IV (ciphertexts differ for identical plaintexts)", async () => {
            const { ks } = await makeKeyStore(0x77);
            const et = new EncryptTransform(ks);

            const body = [1, 2, 3, 4, 5, 6, 7, 8];

            async function encryptBody(): Promise<Uint8Array> {
                const frame = makeAudioFrame(body) as RTCEncodedAudioFrame;
                const { controller, enqueued } = makeController();
                await et.encryptFrame(frame, "audio", controller);
                return new Uint8Array(enqueued[0].data);
            }

            const first = await encryptBody();
            const second = await encryptBody();

            expect(bufEqual(first, second)).toBe(false);
        });
    });
});
