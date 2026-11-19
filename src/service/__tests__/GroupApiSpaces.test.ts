/**
 * GroupApi's Spaces: what reaches the core, in which order, and what comes
 * back. The crypto is the core's; what this layer must not do is turn "the
 * core did not say" into "yes".
 */

import { describe, expect, it, vi, type Mock } from "vitest";
import { GroupApi } from "../GroupApi.js";
import { NO_LOCATION, id, toNativePath } from "../groupPaths.js";
import type { GroupApiNative } from "../../native/GroupApiNative.js";

const PTR = 7;
const LOCATION = ["crm", "note", id("n1")] as const;
const NATIVE_LOCATION = toNativePath(LOCATION);
const ENVELOPE = new Uint8Array([9, 9]);
const BY_ALICE = { expectedAuthor: "alice", currentEpochOnly: false };
const ALICE = { userId: "alice", pubKey: "PK" };

function setup(returns: Record<string, unknown> = {}) {
    const native = new Proxy({} as Record<string, Mock>, {
        get: (target, name: string) => (target[name] ??= vi.fn().mockResolvedValue(returns[name])),
    });
    return { api: new GroupApi(native as unknown as GroupApiNative, PTR), native };
}

const nativeState = {
    spaceId: "s1",
    contextId: "ctx",
    createdBy: "alice",
    groups: [{ groupId: "sales", role: "manager", keyVersion: 4 }],
    users: [{ userId: "bob", pubKey: "PKB", role: "user" }],
    keyVersion: 2,
    keyIsStale: true,
    publicMeta: new Uint8Array([1]),
    privateMeta: new Uint8Array([2]),
    publicMetaVersion: 1,
    privateMetaVersion: 3,
};

describe("GroupApi spaces", () => {
    it("createSpace sends each recipient as a group or a user, and the seed when there is one", async () => {
        const { api, native } = setup({ createSpace: "s1" });
        const meta = new Uint8Array([1]);
        await expect(
            api.createSpace(
                "ctx",
                [
                    { group: "sales", role: "manager" },
                    { user: ALICE, role: "user" },
                ],
                meta,
                meta,
            ),
        ).resolves.toBe("s1");
        expect(native.createSpace).toHaveBeenCalledWith(PTR, [
            "ctx",
            [
                { groupId: "sales", role: "manager" },
                { user: ALICE, role: "user" },
            ],
            meta,
            meta,
            undefined,
        ]);
        const seed = new Uint8Array([5]);
        await api.createSpace("ctx", [], meta, meta, seed);
        expect(native.createSpace.mock.lastCall![1][4]).toBe(seed);
    });

    it("getSpace and listSpaces name a recipient Group's epoch and keep the stale flag", async () => {
        const { api } = setup({
            getSpace: nativeState,
            listSpaces: { totalAvailable: 1, readItems: [nativeState] },
        });
        const state = await api.getSpace("s1");
        expect(state.groups).toEqual([{ groupId: "sales", role: "manager", epoch: 4 }]);
        expect(state.users).toEqual([{ userId: "bob", pubKey: "PKB", role: "user" }]);
        expect(state.keyVersion).toBe(2);
        expect(state.keyIsStale).toBe(true);
        const page = await api.listSpaces("ctx", { skip: 0, limit: 10, sortOrder: "desc" });
        expect(page.totalAvailable).toBe(1);
        expect(page.readItems[0]).toEqual(state);
    });

    it("recipients are added whole and removed by reference", async () => {
        const { api, native } = setup({ removeSpaceRecipients: 3, rotateSpaceKey: 4 });
        await api.addSpaceRecipients("s1", [{ group: "legal", role: "user" }]);
        expect(native.addSpaceRecipients).toHaveBeenCalledWith(PTR, [
            "s1",
            [{ groupId: "legal", role: "user" }],
        ]);
        await expect(
            api.removeSpaceRecipients("s1", [{ group: "support" }, { userId: "bob" }]),
        ).resolves.toBe(3);
        expect(native.removeSpaceRecipients).toHaveBeenCalledWith(PTR, [
            "s1",
            [{ groupId: "support" }, { userId: "bob" }],
        ]);
        await expect(api.rotateSpaceKey("s1")).resolves.toBe(4);
        await api.deleteSpace("s1");
        expect(native.deleteSpace).toHaveBeenCalledWith(PTR, ["s1"]);
    });

    it("the meta calls carry the version they replace", async () => {
        const { api, native } = setup();
        const meta = new Uint8Array([7]);
        await api.updateSpacePublicMeta("s1", meta, 2);
        expect(native.updateSpacePublicMeta).toHaveBeenCalledWith(PTR, ["s1", meta, 2]);
        await api.updateSpacePrivateMeta("s1", meta, 5);
        expect(native.updateSpacePrivateMeta).toHaveBeenCalledWith(PTR, ["s1", meta, 5]);
    });

    it("encryptInSpace binds to the location, or to none when that is said", async () => {
        const { api, native } = setup();
        const data = new Uint8Array([1]);
        await api.encryptInSpace("s1", LOCATION, data);
        expect(native.encryptInSpace).toHaveBeenCalledWith(PTR, ["s1", NATIVE_LOCATION, data]);
        await api.encryptInSpace("s1", NO_LOCATION, data);
        expect(native.encryptInSpace).toHaveBeenLastCalledWith(PTR, [
            "s1",
            toNativePath(NO_LOCATION),
            data,
        ]);
    });

    it("decryptInSpace never reports access the core did not confirm", async () => {
        const envelope = (authorAccess: string) => ({
            data: new Uint8Array([1]),
            origin: { author: ALICE, via: "sales", authorAccess, keyVersion: 2 },
            encryptedAt: 5,
        });
        for (const [said, expected] of [
            ["yes", "yes"],
            ["no", "no"],
            ["unknown", "unknown"],
            ["", "unknown"],
            ["YES", "unknown"],
        ] as const) {
            const { api, native } = setup({ decryptInSpace: envelope(said) });
            const opened = await api.decryptInSpace("s1", LOCATION, ENVELOPE, {
                expectedAuthor: "alice",
            });
            expect(opened.origin.authorAccess).toBe(expected);
            expect(opened.origin.via).toBe("sales");
            expect(native.decryptInSpace).toHaveBeenCalledWith(PTR, [
                "s1",
                NATIVE_LOCATION,
                ENVELOPE,
                BY_ALICE,
            ]);
        }
    });

    it("a read in a Space names its author too", async () => {
        const { api, native } = setup();
        await expect(api.decryptInSpace("s1", LOCATION, ENVELOPE, {} as never)).rejects.toThrow(
            TypeError,
        );
        await expect(
            api.openSequenceInSpace("s1", LOCATION, ENVELOPE, {} as never),
        ).rejects.toThrow(TypeError);
        await expect(
            api.beginFileDecryptionInSpace("s1", LOCATION, ENVELOPE, {} as never),
        ).rejects.toThrow(TypeError);
        expect(native.decryptInSpace).not.toHaveBeenCalled();
        expect(native.openSequenceInSpace).not.toHaveBeenCalled();
        expect(native.beginFileDecryptionInSpace).not.toHaveBeenCalled();
    });

    it("decryptManyInSpace reports each item on its own", async () => {
        const { api } = setup({
            decryptManyInSpace: [
                {
                    statusCode: 0,
                    envelope: {
                        data: new Uint8Array([1]),
                        origin: { author: ALICE, via: "user", authorAccess: "yes", keyVersion: 1 },
                        encryptedAt: 5,
                    },
                    details: { userId: "", pubKey: "", envelopeKind: "" },
                },
                {
                    statusCode: 0xd0016,
                    envelope: {},
                    details: { userId: "", pubKey: "", envelopeKind: "member" },
                },
            ],
        });
        const item = { location: LOCATION, envelope: ENVELOPE, options: { expectedAuthor: "alice" } };
        const [ok, failed] = await api.decryptManyInSpace("s1", [item, item]);
        expect(ok.ok && ok.origin.authorAccess).toBe("yes");
        expect(failed).toEqual({ ok: false, code: 0xd0016, details: { envelopeKind: "member" } });
    });

    it("files and sequences in a Space forward the Space, the location and the author", async () => {
        const { api, native } = setup({
            beginFileEncryptionInSpace: 3,
            getSpaceSequenceOrigin: { author: ALICE, via: "sales", authorAccess: "no", keyVersion: 2 },
        });
        await expect(api.beginFileEncryptionInSpace("s1", LOCATION)).resolves.toBe(3);
        expect(native.beginFileEncryptionInSpace).toHaveBeenCalledWith(PTR, ["s1", NATIVE_LOCATION]);
        await api.beginFileDecryptionInSpace("s1", LOCATION, ENVELOPE, { expectedAuthor: "alice" });
        expect(native.beginFileDecryptionInSpace).toHaveBeenCalledWith(PTR, [
            "s1",
            NATIVE_LOCATION,
            ENVELOPE,
            BY_ALICE,
        ]);
        await api.beginSequenceInSpace("s1", LOCATION);
        expect(native.beginSequenceInSpace).toHaveBeenCalledWith(PTR, ["s1", NATIVE_LOCATION, 64]);
        const mark = new Uint8Array([2]);
        await api.openSequenceInSpace("s1", LOCATION, ENVELOPE, { expectedAuthor: "alice" }, mark);
        expect(native.openSequenceInSpace).toHaveBeenCalledWith(PTR, [
            "s1",
            NATIVE_LOCATION,
            ENVELOPE,
            BY_ALICE,
            mark,
        ]);
        await expect(api.getSpaceSequenceOrigin(6)).resolves.toEqual({
            author: ALICE,
            via: "sales",
            authorAccess: "no",
            keyVersion: 2,
        });
    });

    it("subjects: the path's bytes come from the core, and a pin names the context", async () => {
        const bytes = new Uint8Array([4, 2]);
        const { api, native } = setup({ encodePath: bytes, deriveSpaceId: "s9" });
        await expect(api.encodePath(LOCATION)).resolves.toBe(bytes);
        expect(native.encodePath).toHaveBeenCalledWith(PTR, [NATIVE_LOCATION]);
        await api.pinGroupToSubject("ctx", LOCATION, "g1");
        expect(native.pinGroupToSubject).toHaveBeenCalledWith(PTR, ["ctx", NATIVE_LOCATION, "g1"]);
        await expect(api.deriveSpaceId("ctx", bytes)).resolves.toBe("s9");
        expect(native.deriveSpaceId).toHaveBeenCalledWith(PTR, ["ctx", bytes]);
    });

    it("getSpaceLog returns the core's verified history as it is", async () => {
        const page = {
            totalAvailable: 1,
            readItems: [
                {
                    seq: 1,
                    kind: "create",
                    author: "alice",
                    authorPubKey: "PK",
                    via: "sales",
                    date: 5,
                    keyVersion: 1,
                    addedGroups: ["sales"],
                    addedUsers: [],
                    removedGroups: [],
                    removedUsers: [],
                },
            ],
        };
        const { api, native } = setup({ getSpaceLog: page });
        const query = { skip: 0, limit: 10, sortOrder: "asc" as const };
        await expect(api.getSpaceLog("s1", query)).resolves.toEqual(page);
        expect(native.getSpaceLog).toHaveBeenCalledWith(PTR, ["s1", query]);
    });

    it("getGroupPublicKey carries the Group's creator", async () => {
        const { api } = setup({
            getGroupPublicKey: { groupId: "g1", keyVersion: 3, pubKey: "PUB", creator: "alice" },
        });
        await expect(api.getGroupPublicKey("ctx", "g1")).resolves.toEqual({
            groupId: "g1",
            epoch: 3,
            pubKey: "PUB",
            creator: "alice",
        });
    });
});
