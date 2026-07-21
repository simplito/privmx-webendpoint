/**
 * Benchmark for the E2EE frame hot-path optimizations.
 *
 * Runs with `npx vitest bench src/webStreams/worker/__tests__/EncryptTransform.bench.ts`.
 * (The vitest `test.include` is `src/**\/*.test.ts`, so this `.bench.ts` file is
 * never executed by `npx vitest run` - only by `vitest bench`.)
 *
 * It is an A/B comparison of the pre-change path against the new frame route,
 * for the four optimizations:
 *   #1 decrypt no longer splits ciphertext+tag (and the facade no longer
 *      re-concatenates them),
 *   #2 the frame route skips `assertArgsValid` + the `assertIsUint8Array` checks,
 *   #4 the frame route skips the defensive `new Uint8Array(...)` copies of
 *      iv/aad/data, and
 *   #3 the wire key-id bytes are cached at setKeys time instead of being
 *      `TextEncoder.encode`d (and `String.slice`d) every frame.
 *
 * The underlying WebCrypto AES-GCM call is identical in both arms, so the
 * delta each `describe` reports is purely the per-frame overhead removed - it
 * is deliberately a smaller fraction on large frames (where the cipher itself
 * dominates) and a larger fraction on tiny audio frames (where the overhead
 * dominates). Beyond raw time, the new path allocates far less per frame, which
 * matters most for real-time media: fewer GC pauses => fewer audio glitches.
 */
import { bench, describe } from "vitest";
import { setGlobalEmCrypto } from "../../../crypto/index.js";
import { CryptoFacade } from "../../../crypto/CryptoFacade.js";
import { KeyStore } from "../../KeyStore.js";
import { EncryptTransform, RTCEncodedVideoFrameType } from "../EncryptTransform.js";

setGlobalEmCrypto();

const GCM_TAG_LEN = 16;
const KEY_ID = "bench-key-0";

const keyStore = new KeyStore();
await keyStore.setKeys([{ keyId: KEY_ID, key: new Uint8Array(32).fill(0x2a), type: 0 }]);
const internalKeyId = keyStore.getEncryptionKeyId();
const et = new EncryptTransform(keyStore);

// Deterministic (no Math.random) filler so buffers are stable across runs.
function filled(len: number, seed: number): Uint8Array {
    const a = new Uint8Array(len);
    for (let i = 0; i < len; i++) a[i] = (i + seed) & 0xff;
    return a;
}

const iv = filled(12, 1);
// Discards the enqueued frame; we only care about the crypto/framing cost.
const noopController = {
    enqueue() {},
} as unknown as TransformStreamDefaultController<unknown>;

interface FrameProfile {
    name: string;
    kind: "audio" | "video";
    videoType?: RTCEncodedVideoFrameType;
    headerLen: number;
    bodyLen: number;
}

// Representative encoded-frame sizes: a 20ms Opus audio frame, a typical video
// delta frame, and a video keyframe (the "tens of KB" case from the analysis).
const PROFILES: FrameProfile[] = [
    { name: "audio ~160B", kind: "audio", headerLen: 1, bodyLen: 160 },
    { name: "video delta ~3KB", kind: "video", videoType: "delta", headerLen: 3, bodyLen: 3 * 1024 },
    { name: "video key ~30KB", kind: "video", videoType: "key", headerLen: 10, bodyLen: 30 * 1024 },
];

type EncodedFrame = RTCEncodedAudioFrame | RTCEncodedVideoFrame;

function makeFrame(template: ArrayBuffer, videoType?: RTCEncodedVideoFrameType): EncodedFrame {
    // encryptFrame/decryptFrame mutate `frame.data` in place, so every iteration
    // needs a fresh copy of the buffer. slice(0) is that per-iteration copy; it
    // is charged to the "full path" benches below (and only those).
    return { data: template.slice(0), type: videoType } as unknown as EncodedFrame;
}

interface Prepared {
    p: FrameProfile;
    aad: Uint8Array;
    body: Uint8Array;
    ciphertextWithTag: Uint8Array; // contiguous [ciphertext | 16B tag]
    plaintextTemplate: ArrayBuffer; // [header | body], for full-path encrypt
    encryptedTemplate: ArrayBuffer; // full wire frame, for full-path decrypt
}

const prepared: Prepared[] = [];
for (const p of PROFILES) {
    const aad = filled(p.headerLen, 9);
    const body = filled(p.bodyLen, 3);
    const ciphertextWithTag = new Uint8Array(
        await CryptoFacade.aeadEncryptFrame(internalKeyId, iv, aad, body),
    );

    const plaintextTemplate = new ArrayBuffer(p.headerLen + p.bodyLen);
    const u = new Uint8Array(plaintextTemplate);
    u.fill(0xaa, 0, p.headerLen);
    u.set(body, p.headerLen);

    // Build one real encrypted wire frame to feed the full-path decrypt bench.
    const captured: Array<{ data: ArrayBuffer }> = [];
    await et.encryptFrame(
        makeFrame(plaintextTemplate, p.videoType),
        p.kind,
        { enqueue: (f: unknown) => captured.push(f as { data: ArrayBuffer }) } as unknown as
            TransformStreamDefaultController<unknown>,
        -99,
    );

    prepared.push({
        p,
        aad,
        body,
        ciphertextWithTag,
        plaintextTemplate,
        encryptedTemplate: captured[0].data,
    });
}

// --- #1 + #2 + #4: crypto facade, old vs new (no wire-framing, no mutation) ---

for (const { p, aad, body, ciphertextWithTag } of prepared) {
    describe(`facade encrypt — ${p.name}`, () => {
        bench("OLD aeadEncrypt (asserts + defensive copies)", async () => {
            await CryptoFacade.aeadEncrypt(internalKeyId, iv, aad, body);
        });
        bench("NEW aeadEncryptFrame", async () => {
            await CryptoFacade.aeadEncryptFrame(internalKeyId, iv, aad, body);
        });
    });

    describe(`facade decrypt — ${p.name}`, () => {
        bench("OLD split + aeadDecrypt (split/reconcat + asserts + copies)", async () => {
            // Reproduces the pre-change EncryptTransform.decryptAes: split the
            // contiguous buffer into data + tag before calling aeadDecrypt,
            // which then concatenates them straight back together.
            const data = ciphertextWithTag.slice(0, ciphertextWithTag.length - GCM_TAG_LEN);
            const tag = ciphertextWithTag.slice(ciphertextWithTag.length - GCM_TAG_LEN);
            await CryptoFacade.aeadDecrypt(internalKeyId, iv, aad, data, tag);
        });
        bench("NEW aeadDecryptFrame (contiguous)", async () => {
            await CryptoFacade.aeadDecryptFrame(internalKeyId, iv, aad, ciphertextWithTag);
        });
    });
}

// --- #3: per-frame wire key-id derivation, old vs new -----------------------

const textEncoder = new TextEncoder();
// A representative internal key id (`<uuid>:<keyId>`) to strip like the old
// getEncryptionExternalKeyId did.
const fakeInternalId = `${crypto.randomUUID()}:${KEY_ID}`;
const prefixLen = fakeInternalId.length - KEY_ID.length;

describe("wire key-id per frame (#3)", () => {
    bench("OLD String.slice + TextEncoder.encode per frame", () => {
        const ext = fakeInternalId.slice(prefixLen);
        textEncoder.encode(ext);
    });
    bench("NEW cached bytes (getEncryptionExternalKeyIdBytes)", () => {
        keyStore.getEncryptionExternalKeyIdBytes();
    });
});

// --- Absolute throughput of the shipping frame path (new impl only) ---------
// Includes the per-iteration frame-buffer clone (slice(0)) that the mutation of
// encodedFrame.data forces; a real pipeline gets each frame fresh from WebRTC.

for (const { p, plaintextTemplate, encryptedTemplate } of prepared) {
    describe(`full path — ${p.name}`, () => {
        bench("encryptFrame (crypto + wire-framing + cached key id)", async () => {
            await et.encryptFrame(makeFrame(plaintextTemplate, p.videoType), p.kind, noopController, -99);
        });
        bench("decryptFrame (parse + crypto)", async () => {
            await et.decryptFrame(makeFrame(encryptedTemplate, p.videoType), p.kind, noopController);
        });
    });
}
