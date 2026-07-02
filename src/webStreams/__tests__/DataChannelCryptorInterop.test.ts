import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { DataChannelCryptor } from "../DataChannelCryptor.js";
import { DataChannelSession } from "../DataChannelSession.js";
import { KeyStore } from "../KeyStore.js";

/**
 * Cross-checks the encrypted DataChannel wire format (DataChannelCryptor.ts) against
 * the C++ implementation (DataChannelMessageEncryptorV1) from the sibling privmx-endpoint
 * repo. Opt-in / dev-only: not run in CI.
 *
 * To run:
 *   1. Build the tool in your privmx-endpoint build tree:
 *        cmake --build build --target datachannel_vector_tool
 *   2. PRIVMX_ENDPOINT_VECTOR_TOOL=/path/to/build/test/datachannel_vector_tool \
 *        npx vitest run src/webStreams/__tests__/DataChannelCryptorInterop.test.ts
 *
 * Known cross-implementation quirks documented by the tests below (not fixed here -
 * they live in privmx-endpoint):
 *  - DataChannelMessageEncryptorV1::parseEncryptedMessage hardcodes the header length to
 *    FIXED_HEADER_LENGTH + 32 instead of reading the serialized KeyIdLen byte, so it can
 *    only round-trip frames whose keyId is exactly 32 bytes (TS correctly parses any
 *    length). All vectors below use a 32-byte keyId for that reason.
 *  - DataChannelMessageEncryptorV1::decryptMessage catches version/length/key/auth errors
 *    into `statusCode`, but lets a replayed/out-of-order sequence number's exception
 *    escape uncaught - unlike every other failure mode. TS always throws a
 *    DataChannelCryptorError uniformly. See the replay test below.
 */

const TOOL = process.env.PRIVMX_ENDPOINT_VECTOR_TOOL;
const describeIfTool = TOOL ? describe : describe.skip;

const KEY = new Uint8Array(32).map((_, i) => i);
const KEY_ID = "k".repeat(32); // 32 bytes - see the header-note above.

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const fromHex = (s: string) => new Uint8Array(Buffer.from(s.trim(), "hex"));

function runTool(args: string[]): { status: number; lines: string[] } {
    try {
        const out = execFileSync(TOOL!, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        return { status: 0, lines: extractPayloadLines(out) };
    } catch (e: any) {
        return { status: e.status ?? 1, lines: extractPayloadLines(e.stdout?.toString() ?? "") };
    }
}

// The tool logs verbose PRIVMX TRACE/DEBUG/INFO lines to stdout; only lines that look
// like our own output (a bare hex frame, or "SEQ=...") are real payload lines.
function extractPayloadLines(stdout: string): string[] {
    return stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^[0-9a-f]+$/.test(l) || l.startsWith("SEQ="));
}

async function makeCryptor(key: Uint8Array = KEY, keyId: string = KEY_ID): Promise<DataChannelCryptor> {
    const keyStore = new KeyStore();
    await keyStore.setKeys([{ keyId, key, type: 0 }]);
    return new DataChannelCryptor(keyStore);
}

describeIfTool("DataChannelCryptor <-> C++ DataChannelMessageEncryptorV1 interop", () => {
    it("C++ encrypts, TS decrypts", async () => {
        const seq = 1;
        const plaintext = "hello from cpp";
        const { status, lines } = runTool(["enc", toHex(KEY), KEY_ID, String(seq), plaintext]);
        expect(status).toBe(0);
        expect(lines).toHaveLength(1);

        const cryptor = await makeCryptor();
        const { data, seq: gotSeq } = await cryptor.decryptFromWireFormat({
            frame: fromHex(lines[0]),
            lastSequenceNumber: 0,
        });
        expect(new TextDecoder().decode(data)).toBe(plaintext);
        expect(gotSeq).toBe(seq);
    });

    it("TS encrypts, C++ decrypts", async () => {
        const seq = 1;
        const plaintext = "hello from ts";
        const cryptor = await makeCryptor();
        const frame = await cryptor.encryptToWireFormat({
            plaintext: new TextEncoder().encode(plaintext),
            sequenceNumber: seq,
        });

        const { status, lines } = runTool(["dec", toHex(KEY), KEY_ID, toHex(frame)]);
        expect(status).toBe(0);
        expect(lines).toEqual([`SEQ=${seq} STATUS=0 DATA=${plaintext}`]);
    });

    it("wrong key fails to decrypt on both sides (no crash, auth failure)", async () => {
        const seq = 1;
        const plaintext = "secret";
        const wrongKey = new Uint8Array(32).fill(0xff);

        // C++ encrypts with KEY, TS tries to decrypt with wrongKey.
        const enc = runTool(["enc", toHex(KEY), KEY_ID, String(seq), plaintext]);
        expect(enc.status).toBe(0);
        const wrongCryptor = await makeCryptor(wrongKey);
        await expect(
            wrongCryptor.decryptFromWireFormat({ frame: fromHex(enc.lines[0]), lastSequenceNumber: 0 }),
        ).rejects.toThrow();

        // TS encrypts with KEY, C++ tries to decrypt with wrongKey.
        const cryptor = await makeCryptor();
        const frame = await cryptor.encryptToWireFormat({
            plaintext: new TextEncoder().encode(plaintext),
            sequenceNumber: seq,
        });
        const dec = runTool(["dec", toHex(wrongKey), KEY_ID, toHex(frame)]);
        expect(dec.status).toBe(0); // doesn't crash - fails via a non-zero statusCode
        expect(dec.lines[0]).not.toContain("STATUS=0");
    });

    it("replayed/out-of-order sequence numbers are rejected on both sides", async () => {
        const cryptor = await makeCryptor();
        const frame5 = await cryptor.encryptToWireFormat({
            plaintext: new TextEncoder().encode("first"),
            sequenceNumber: 5,
        });
        const frame3 = await cryptor.encryptToWireFormat({
            plaintext: new TextEncoder().encode("replayed-lower-seq"),
            sequenceNumber: 3,
        });

        // TS: DataChannelSession tracks inbound seq per remote stream and throws on replay.
        const session = new DataChannelSession(cryptor);
        await session.decrypt(1, frame5);
        await expect(session.decrypt(1, frame3)).rejects.toThrow();

        // C++: decrypting both frames on one encryptor instance - the second call's
        // exception is NOT caught into a statusCode (see the header note), it escapes and
        // the tool exits non-zero after printing only the first result.
        const dec = runTool(["dec", toHex(KEY), KEY_ID, toHex(frame5), toHex(frame3)]);
        expect(dec.status).not.toBe(0);
        expect(dec.lines).toEqual(["SEQ=5 STATUS=0 DATA=first"]);
    });
});
