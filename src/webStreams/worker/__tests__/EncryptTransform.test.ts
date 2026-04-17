import { setGlobalEmCrypto } from "../../../crypto/index";
import { KeyStore } from "../../KeyStore";
import { EncryptTransform, RTCEncodedVideoFrameType } from "../EncryptTransform";

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

/** Build a KeyStore with a single 32-byte key loaded and return both. */
async function makeKeyStore(keyByte = 0x42): Promise<{ ks: KeyStore; keyBytes: Uint8Array }> {
    const keyBytes = new Uint8Array(32).fill(keyByte);
    const ks = new KeyStore();
    // KeyStore.setKeys wipes the input buffer, so pass a copy; must await (async import)
    await ks.setKeys([{ keyId: `key-${keyByte.toString(16)}`, key: keyBytes.slice(), type: 0 }]);
    return { ks, keyBytes };
}

// ---- tests ------------------------------------------------------------------

describe("EncryptTransform", () => {
    describe("encryptFrame + decryptFrame — audio", () => {
        it("body is not plaintext after encryption", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            const body = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
            const frame = makeAudioFrame(body) as RTCEncodedAudioFrame;
            const originalBody = new Uint8Array(body);

            const { controller, enqueued } = makeController();
            await et.encryptFrame(frame, "audio", controller, 0);

            expect(enqueued).toHaveLength(1);
            const encryptedData = new Uint8Array(enqueued[0].data);

            // Output is larger than input (IV + keyId + lengths + RMS appended)
            expect(encryptedData.byteLength).toBeGreaterThan(1 + body.length);

            // Body bytes (after 1B audio header) should differ from original plaintext
            const encryptedBody = encryptedData.slice(1, 1 + body.length);
            expect(bufEqual(encryptedBody, originalBody)).toBe(false);
        });

        it("header byte is preserved unencrypted (AAD)", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            const frame = makeAudioFrame([0xde, 0xad, 0xbe, 0xef]) as RTCEncodedAudioFrame;
            const originalHeader = new Uint8Array(frame.data, 0, 1)[0];

            const { controller, enqueued } = makeController();
            await et.encryptFrame(frame, "audio", controller, 0);

            expect(new Uint8Array(enqueued[0].data)[0]).toBe(originalHeader);
        });

        it("decrypts back to the original payload", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            const body = [10, 20, 30, 40, 50, 60, 70, 80];
            const frame = makeAudioFrame(body) as RTCEncodedAudioFrame;

            const { controller: encCtrl, enqueued: encQueued } = makeController();
            await et.encryptFrame(frame, "audio", encCtrl, 0);

            const { controller: decCtrl, enqueued: decQueued } = makeController();
            const rms = await et.decryptFrame(
                encQueued[0] as unknown as RTCEncodedAudioFrame,
                "audio",
                decCtrl,
            );

            expect(rms).not.toBeNull();
            const decrypted = new Uint8Array(decQueued[0].data);
            // 1B header + original body
            expect(decrypted.byteLength).toBe(1 + body.length);
            expect(Array.from(decrypted.slice(1))).toEqual(body);
        });

        it("embeds and recovers the RMS value", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            const rmsIn = 37; // arbitrary value in valid range
            const frame = makeAudioFrame([1, 2, 3, 4]) as RTCEncodedAudioFrame;

            const { controller: encCtrl, enqueued: encQueued } = makeController();
            await et.encryptFrame(frame, "audio", encCtrl, rmsIn);

            const { controller: decCtrl } = makeController();
            const rmsOut = await et.decryptFrame(
                encQueued[0] as unknown as RTCEncodedAudioFrame,
                "audio",
                decCtrl,
            );

            expect(rmsOut).toBe(rmsIn);
        });
    });

    describe("encryptFrame + decryptFrame — video", () => {
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
                await et.encryptFrame(frame, "video", encCtrl, 0);

                const encryptedData = new Uint8Array(encQueued[0].data);

                // Header is unchanged
                expect(Array.from(encryptedData.slice(0, hLen))).toEqual(
                    Array.from(originalHeader),
                );

                // Body bytes right after header should not be plaintext
                const bodyAfterHeader = encryptedData.slice(hLen, hLen + body.length);
                expect(bufEqual(bodyAfterHeader, new Uint8Array(body))).toBe(false);

                // Decrypt restores original body
                const { controller: decCtrl, enqueued: decQueued } = makeController();
                await et.decryptFrame(
                    encQueued[0] as unknown as RTCEncodedVideoFrame,
                    "video",
                    decCtrl,
                );
                const decrypted = new Uint8Array(decQueued[0].data);
                expect(Array.from(decrypted.slice(hLen))).toEqual(body);
            },
        );
    });

    describe("wrong key — pass-through", () => {
        it("enqueues the frame unchanged when the keyId is not in the store", async () => {
            const { ks: encKs } = await makeKeyStore(0x11);
            const { ks: decKs } = await makeKeyStore(0x22); // different key
            const encEt = new EncryptTransform(encKs);
            const decEt = new EncryptTransform(decKs);

            const body = [0xca, 0xfe, 0xba, 0xbe];
            const frame = makeAudioFrame(body) as RTCEncodedAudioFrame;

            const { controller: encCtrl, enqueued: encQueued } = makeController();
            await encEt.encryptFrame(frame, "audio", encCtrl, 0);

            const encryptedSnapshot = copyBuffer(encQueued[0].data);

            const { controller: decCtrl, enqueued: decQueued } = makeController();
            const rms = await decEt.decryptFrame(
                encQueued[0] as unknown as RTCEncodedAudioFrame,
                "audio",
                decCtrl,
            );

            // Returns null — could not decrypt
            expect(rms).toBeNull();
            // Frame passed through unmodified
            expect(bufEqual(new Uint8Array(decQueued[0].data), encryptedSnapshot)).toBe(true);
        });
    });

    describe("tampered ciphertext — AEAD tag failure", () => {
        it("enqueues the frame and returns null when ciphertext is corrupted", async () => {
            const { ks } = await makeKeyStore(0x33);
            const et = new EncryptTransform(ks);

            const body = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
            const frame = makeAudioFrame(body) as RTCEncodedAudioFrame;

            const { controller: encCtrl, enqueued: encQueued } = makeController();
            await et.encryptFrame(frame, "audio", encCtrl, 0);

            // Flip a byte in the middle of the ciphertext (after 1B audio header)
            const tampered = new Uint8Array(encQueued[0].data.slice(0));
            tampered[2] ^= 0xff;
            encQueued[0].data = tampered.buffer;

            const { controller: decCtrl, enqueued: decQueued } = makeController();
            const rms = await et.decryptFrame(
                encQueued[0] as unknown as RTCEncodedAudioFrame,
                "audio",
                decCtrl,
            );

            expect(rms).toBeNull();
            // The corrupted frame is still enqueued (pass-through on failure)
            expect(decQueued).toHaveLength(1);
        });
    });

    describe("short frame — pass-through", () => {
        it("enqueues a frame that is too short to contain E2EE metadata", async () => {
            const { ks } = await makeKeyStore();
            const et = new EncryptTransform(ks);

            // 3 bytes total — less than headerLen(1) + 5 minimum trailer bytes
            const tiny = { data: new Uint8Array([0xaa, 0x01, 0x02]).buffer };
            const { controller, enqueued } = makeController();
            const rms = await et.decryptFrame(
                tiny as unknown as RTCEncodedAudioFrame,
                "audio",
                controller,
            );

            expect(rms).toBeNull();
            expect(enqueued).toHaveLength(1);
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
                await et.encryptFrame(frame, "audio", controller, 0);
                return new Uint8Array(enqueued[0].data);
            }

            const first = await encryptBody();
            const second = await encryptBody();

            // Same plaintext, same key — but different IVs produce different ciphertext
            expect(bufEqual(first, second)).toBe(false);
        });
    });
});
