/**
 * GroupApi's files and sequences: what reaches the core, in which order, and
 * what comes back. One check per method; the crypto is the core's.
 */

import { describe, expect, it, vi, type Mock } from "vitest";
import { GroupApi } from "../GroupApi.js";
import { ANY_AUTHOR, NO_LOCATION, id, toNativePath } from "../groupPaths.js";
import type { GroupApiNative } from "../../native/GroupApiNative.js";

const PTR = 7;
const LOCATION = ["scan", id("s1")] as const;
const NATIVE_LOCATION = toNativePath(LOCATION);
const ENVELOPE = new Uint8Array([9, 9]);
const BY_ALICE = { expectedAuthor: "alice", currentEpochOnly: false };

function setup(returns: Record<string, unknown> = {}) {
    const native = new Proxy({} as Record<string, Mock>, {
        get: (target, name: string) => (target[name] ??= vi.fn().mockResolvedValue(returns[name])),
    });
    return { api: new GroupApi(native as unknown as GroupApiNative, PTR), native };
}

describe("GroupApi files", () => {
    it("beginFileEncryption sends the location and the further readers", async () => {
        const { api, native } = setup({ beginFileEncryption: 3 });
        await expect(
            api.beginFileEncryption("g1", LOCATION, { alsoFor: [{ group: "billing" }] }),
        ).resolves.toBe(3);
        expect(native.beginFileEncryption).toHaveBeenCalledWith(PTR, [
            "g1",
            NATIVE_LOCATION,
            { alsoFor: [{ groupId: "billing" }] },
        ]);
    });

    it("the outsider and anonymous writers take their own paths", async () => {
        const { api, native } = setup();
        await api.beginFileEncryptionAsOutsider("ctx", "g1", LOCATION);
        expect(native.beginFileEncryptionAsOutsider).toHaveBeenCalledWith(PTR, [
            "ctx",
            "g1",
            NATIVE_LOCATION,
            { alsoFor: [] },
        ]);
        await api.beginFileEncryptionAnonymously("g1", "PUB", NO_LOCATION);
        expect(native.beginFileEncryptionAnonymously).toHaveBeenCalledWith(PTR, [
            "g1",
            "PUB",
            toNativePath(NO_LOCATION),
        ]);
    });

    it("every reader names the location, and the signed ones the author", async () => {
        const { api, native } = setup();
        await api.beginFileDecryption("g1", LOCATION, ENVELOPE, { expectedAuthor: "alice" });
        expect(native.beginFileDecryption).toHaveBeenCalledWith(PTR, [
            "g1",
            NATIVE_LOCATION,
            ENVELOPE,
            BY_ALICE,
        ]);
        await api.beginFileDecryptionFromOutsider("g1", LOCATION, ENVELOPE, {
            expectedAuthor: ANY_AUTHOR,
        });
        expect(native.beginFileDecryptionFromOutsider).toHaveBeenCalledWith(PTR, [
            "g1",
            NATIVE_LOCATION,
            ENVELOPE,
            { anyAuthor: true, currentEpochOnly: false },
        ]);
        await api.beginAnonymousFileDecryption("g1", LOCATION, ENVELOPE);
        expect(native.beginAnonymousFileDecryption).toHaveBeenCalledWith(PTR, [
            "g1",
            NATIVE_LOCATION,
            ENVELOPE,
        ]);
        await api.beginSharedFileDecryption("ctx", LOCATION, ENVELOPE, { expectedAuthor: "alice" });
        expect(native.beginSharedFileDecryption).toHaveBeenCalledWith(PTR, [
            "ctx",
            NATIVE_LOCATION,
            ENVELOPE,
            BY_ALICE,
        ]);
    });

    it("a read without an expected author never reaches the core", async () => {
        const { api, native } = setup();
        await expect(
            api.beginFileDecryption("g1", LOCATION, ENVELOPE, {} as never),
        ).rejects.toThrow(TypeError);
        await expect(api.openSequence("g1", LOCATION, ENVELOPE, {} as never)).rejects.toThrow(
            TypeError,
        );
        expect(native.beginFileDecryption).not.toHaveBeenCalled();
        expect(native.openSequence).not.toHaveBeenCalled();
    });

    it("chunk calls and the range forward the handle", async () => {
        const range = { offset: 100, length: 50 };
        const { api, native } = setup({ getFileCipherRange: range, seekInEncryptedFile: 100 });
        const chunk = new Uint8Array([1]);
        await api.encryptFileChunk(3, chunk);
        expect(native.encryptFileChunk).toHaveBeenCalledWith(PTR, [3, chunk]);
        await api.finishFileEncryption(3);
        expect(native.finishFileEncryption).toHaveBeenCalledWith(PTR, [3]);
        await api.decryptFileChunk(4, chunk);
        expect(native.decryptFileChunk).toHaveBeenCalledWith(PTR, [4, chunk]);
        await expect(api.getFileCipherRange(4, 10, 20)).resolves.toEqual(range);
        expect(native.getFileCipherRange).toHaveBeenCalledWith(PTR, [4, 10, 20]);
        await expect(api.seekInEncryptedFile(4, 10)).resolves.toBe(100);
    });

    it("finishFileDecryption reports a member's file with an author and nothing about sharing", async () => {
        const { api } = setup({
            finishFileDecryption: {
                author: { userId: "alice", pubKey: "PK", role: "manager" },
                homeGroupId: "",
                senderMembership: "",
                via: "",
                sharedWith: { groups: [], users: [] },
                keyVersion: 2,
                size: 10,
                complete: true,
            },
        });
        await expect(api.finishFileDecryption(4)).resolves.toEqual({
            author: { userId: "alice", pubKey: "PK", role: "manager" },
            sharedWith: { groups: [], users: [] },
            epoch: 2,
            size: 10,
            complete: true,
        });
    });

    it("finishFileDecryption never upgrades a shared file's sender to a member", async () => {
        const shared = {
            sender: { userId: "dave", pubKey: "PK" },
            homeGroupId: "care",
            via: "billing",
            sharedWith: { groups: ["billing"], users: [] as string[] },
            keyVersion: 0,
            size: 1,
            complete: false,
        };
        for (const [membership, expected] of [
            ["member", true],
            ["notMember", false],
            ["unknown", "unknown"],
            ["", "unknown"],
        ] as const) {
            const { api } = setup({
                finishFileDecryption: { ...shared, senderMembership: membership },
            });
            const info = await api.finishFileDecryption(4);
            expect(info.senderIsMember).toBe(expected);
            expect(info.author).toBeUndefined();
            expect(info.sender).toEqual(shared.sender);
            expect(info.via).toBe("billing");
        }
    });

    it("sealFile begins a member's file at the location; openFile seeks for a range", async () => {
        const { api, native } = setup({
            beginFileEncryption: 3,
            beginFileDecryption: 4,
            seekInEncryptedFile: 200,
            getFileCipherRange: { offset: 200, length: 100 },
        });
        const sealer = api.sealFile({ groupId: "g1", location: LOCATION });
        await sealer.writable.close();
        expect(native.beginFileEncryption).toHaveBeenCalledWith(PTR, [
            "g1",
            NATIVE_LOCATION,
            { alsoFor: [] },
        ]);
        const reader = await api.openFile("g1", LOCATION, ENVELOPE, {
            expectedAuthor: "alice",
            from: 250,
            length: 20,
        });
        expect(reader.cipherRange).toEqual({ offset: 200, length: 100 });
        expect(native.beginFileDecryption).toHaveBeenCalledWith(PTR, [
            "g1",
            NATIVE_LOCATION,
            ENVELOPE,
            BY_ALICE,
        ]);
        expect(native.getFileCipherRange).toHaveBeenCalledWith(PTR, [4, 250, 270]);
    });
});

describe("GroupApi sequences", () => {
    it("beginSequence checkpoints every 64 items unless told otherwise", async () => {
        const { api, native } = setup({ beginSequence: 5 });
        await expect(api.beginSequence("g1", LOCATION)).resolves.toBe(5);
        expect(native.beginSequence).toHaveBeenCalledWith(PTR, ["g1", NATIVE_LOCATION, 64]);
        await api.beginSequence("g1", LOCATION, 0);
        expect(native.beginSequence).toHaveBeenLastCalledWith(PTR, ["g1", NATIVE_LOCATION, 0]);
    });

    it("appendToSequence returns a mark only when the core made one", async () => {
        const item = new Uint8Array([1]);
        const mark = new Uint8Array([2]);
        const plain = setup({ appendToSequence: { item } });
        await expect(plain.api.appendToSequence(5, item)).resolves.toEqual({ item });
        expect(plain.native.appendToSequence).toHaveBeenCalledWith(PTR, [5, item]);
        const marked = setup({ appendToSequence: { item, mark } });
        await expect(marked.api.appendToSequence(5, item)).resolves.toEqual({ item, mark });
    });

    it("openSequence sends the header, the expected author and the checkpoint to resume from", async () => {
        const { api, native } = setup({ openSequence: 6 });
        const mark = new Uint8Array([2]);
        await api.openSequence("g1", LOCATION, ENVELOPE, { expectedAuthor: "alice" }, mark);
        expect(native.openSequence).toHaveBeenCalledWith(PTR, [
            "g1",
            NATIVE_LOCATION,
            ENVELOPE,
            BY_ALICE,
            mark,
        ]);
        await api.openSequence("g1", LOCATION, ENVELOPE, { expectedAuthor: "alice" });
        expect(native.openSequence).toHaveBeenLastCalledWith(PTR, [
            "g1",
            NATIVE_LOCATION,
            ENVELOPE,
            BY_ALICE,
            undefined,
        ]);
    });

    it("the remaining calls forward the handle and return the core's answer", async () => {
        const read = { data: new Uint8Array([1]), index: 2, missing: 1 };
        const verified = { attestedItems: 3, closed: true };
        const peeked = { sequenceId: "ab", index: 2, isMark: false };
        const { api, native } = setup({
            readSequenceItem: read,
            verifySequenceMark: verified,
            peekSequenceItem: peeked,
        });
        const bytes = new Uint8Array([7]);
        await api.getSequenceHeader(5);
        expect(native.getSequenceHeader).toHaveBeenCalledWith(PTR, [5]);
        await api.checkpointSequence(5);
        expect(native.checkpointSequence).toHaveBeenCalledWith(PTR, [5]);
        await api.finishSequence(5);
        expect(native.finishSequence).toHaveBeenCalledWith(PTR, [5]);
        await expect(api.readSequenceItem(6, bytes)).resolves.toEqual(read);
        expect(native.readSequenceItem).toHaveBeenCalledWith(PTR, [6, bytes]);
        await expect(api.verifySequenceMark(6, bytes)).resolves.toEqual(verified);
        expect(native.verifySequenceMark).toHaveBeenCalledWith(PTR, [6, bytes]);
        await api.closeSequence(6);
        expect(native.closeSequence).toHaveBeenCalledWith(PTR, [6]);
        await expect(api.peekSequenceItem(bytes)).resolves.toEqual(peeked);
    });

    it("peekEnvelope passes a sequence header's id through", async () => {
        const header = {
            version: 3,
            groupId: "g1",
            keyVersion: 2,
            fromOutsider: false,
            isSigned: true,
            isFile: false,
            hasLocation: true,
            authorUserId: "alice",
            sequenceId: "00ff",
            alsoForGroups: [] as Array<{ groupId: string; keyVersion: number }>,
            alsoForUsers: [] as string[],
        };
        const { api } = setup({ peekEnvelope: header });
        expect((await api.peekEnvelope(ENVELOPE)).sequenceId).toBe("00ff");
        const plain = setup({ peekEnvelope: { ...header, sequenceId: "" } });
        expect("sequenceId" in (await plain.api.peekEnvelope(ENVELOPE))).toBe(false);
    });
});
