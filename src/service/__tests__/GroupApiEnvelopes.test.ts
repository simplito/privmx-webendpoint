/**
 * GroupApi's envelope calls: what reaches the core, and what comes back. The
 * crypto itself is the core's and is tested there; these pin the marshalling a
 * web client depends on - above all that a read cannot leave out whose writing
 * it expects, and that the core's results are not relabelled on the way out.
 */

import { describe, expect, it, vi, type Mock } from "vitest";
import { GroupApi } from "../GroupApi.js";
import { ANY_AUTHOR, id, NO_LOCATION } from "../groupPaths.js";
import { GroupErrorCode } from "../../native/NativeErrorCodes.js";
import type { GroupApiNative } from "../../native/GroupApiNative.js";

const PTR = 7;
const utf8 = (text: string) => new TextEncoder().encode(text);

function setup(returns: Record<string, unknown> = {}) {
    const methods = [
        "createGroup",
        "removeGroupMembers",
        "rotateGroupKey",
        "deriveGroupId",
        "getGroups",
        "getGroupPublicKey",
        "setGroupVisibility",
        "encrypt",
        "decrypt",
        "decryptMany",
        "encryptAsOutsider",
        "encryptAnonymously",
        "decryptFromOutsider",
        "decryptAnonymous",
        "decryptShared",
        "peekEnvelope",
    ];
    const native: Record<string, Mock> = {};
    for (const m of methods) native[m] = vi.fn().mockResolvedValue(returns[m]);
    return {
        api: new GroupApi(native as unknown as GroupApiNative, PTR),
        native,
    };
}

const nativeEnvelope = {
    data: utf8("hello"),
    author: { userId: "alice", pubKey: "PK", role: "manager" },
    keyVersion: 3,
    encryptedAt: 1700000000000,
    sharedWith: { groups: ["g2"], users: ["carol"] },
};
const location = ["chat", id("c1"), "message", id("m1"), "body"] as const;
const nativeLocation = [
    { isId: false, value: utf8("chat") },
    { isId: true, value: id("c1") },
    { isId: false, value: utf8("message") },
    { isId: true, value: id("m1") },
    { isId: false, value: utf8("body") },
];

describe("GroupApi.encrypt", () => {
    it("forwards (ptr, [groupId, location, content, options])", async () => {
        const { api, native } = setup({ encrypt: utf8("env") });
        const content = utf8("x");
        await api.encrypt("g1", location, content);
        expect(native.encrypt).toHaveBeenCalledWith(PTR, [
            "g1",
            nativeLocation,
            content,
            { alsoFor: [] },
        ]);
    });

    it("names further recipients the way the core takes them", async () => {
        const { api, native } = setup();
        const auditor = { userId: "carol", pubKey: "PK" };
        await api.encrypt("g1", location, utf8("x"), {
            alsoFor: [{ group: "g2" }, { user: auditor }],
        });
        expect(native.encrypt.mock.calls[0][1][3]).toEqual({
            alsoFor: [{ groupId: "g2" }, { user: auditor }],
        });
    });

    it("NO_LOCATION has to be passed: there is no encrypt without a location", async () => {
        const { api, native } = setup();
        await api.encrypt("g1", NO_LOCATION, utf8("x"));
        expect(native.encrypt.mock.calls[0][1][1]).toEqual([
            { isId: true, value: new Uint8Array(0) },
        ]);
        await expect(api.encrypt("g1", undefined as never, utf8("x"))).rejects.toThrow(TypeError);
        await expect(api.encrypt("g1", [] as never, utf8("x"))).rejects.toThrow(TypeError);
        expect(native.encrypt).toHaveBeenCalledTimes(1);
    });
});

describe("GroupApi.decrypt", () => {
    it("forwards the expected author and maps the result", async () => {
        const { api, native } = setup({ decrypt: nativeEnvelope });
        const envelope = utf8("env");
        const result = await api.decrypt("g1", location, envelope, {
            expectedAuthor: "alice",
        });
        expect(native.decrypt).toHaveBeenCalledWith(PTR, [
            "g1",
            nativeLocation,
            envelope,
            { expectedAuthor: "alice", currentEpochOnly: false },
        ]);
        expect(result).toEqual({
            data: nativeEnvelope.data,
            author: { userId: "alice", pubKey: "PK", role: "manager" },
            epoch: 3,
            encryptedAt: 1700000000000,
            sharedWith: { groups: ["g2"], users: ["carol"] },
        });
    });

    it("ANY_AUTHOR is said, and never sent together with a name", async () => {
        const { api, native } = setup({ decrypt: nativeEnvelope });
        await api.decrypt("g1", location, utf8("env"), {
            expectedAuthor: ANY_AUTHOR,
            currentEpochOnly: true,
        });
        expect(native.decrypt.mock.calls[0][1][3]).toEqual({
            anyAuthor: true,
            currentEpochOnly: true,
        });
    });

    it("SECURITY: a read that does not say whose writing it expects never reaches the core", async () => {
        const { api, native } = setup({ decrypt: nativeEnvelope });
        const envelope = utf8("env");
        for (const options of [
            undefined,
            null,
            {},
            { expectedAuthor: "" },
            { expectedAuthor: 42 },
            { anyAuthor: true },
        ]) {
            await expect(api.decrypt("g1", location, envelope, options as never)).rejects.toThrow(
                TypeError,
            );
        }
        expect(native.decrypt).not.toHaveBeenCalled();
    });

    it("SECURITY: a role the core did not call manager is not shown as one", async () => {
        const { api } = setup({
            decrypt: {
                ...nativeEnvelope,
                author: { userId: "bob", pubKey: "PK", role: "owner" },
            },
        });
        expect(
            (
                await api.decrypt("g1", location, utf8("env"), {
                    expectedAuthor: "bob",
                })
            ).author.role,
        ).toBe("user");
    });
});

describe("GroupApi.decryptMany", () => {
    it("reports each item on its own", async () => {
        const { api, native } = setup({
            decryptMany: [
                {
                    statusCode: 0,
                    envelope: nativeEnvelope,
                    details: { userId: "", pubKey: "", envelopeKind: "" },
                },
                {
                    statusCode: GroupErrorCode.ENVELOPE_WRONG_AUTHOR,
                    envelope: {},
                    details: { userId: "bob", pubKey: "PKB", envelopeKind: "" },
                },
                {
                    statusCode: GroupErrorCode.ENVELOPE_WRONG_KIND,
                    envelope: {},
                    details: { userId: "", pubKey: "", envelopeKind: "anonymous" },
                },
            ],
        });
        const e = utf8("env");
        const results = await api.decryptMany("g1", [
            { location, envelope: e, options: { expectedAuthor: "alice" } },
            { location, envelope: e, options: { expectedAuthor: "alice" } },
            {
                location: NO_LOCATION,
                envelope: e,
                options: { expectedAuthor: ANY_AUTHOR },
            },
        ]);
        expect(native.decryptMany.mock.calls[0][1][1][2]).toEqual({
            envelope: e,
            location: [{ isId: true, value: new Uint8Array(0) }],
            options: { anyAuthor: true, currentEpochOnly: false },
        });
        expect(results[0]).toMatchObject({
            ok: true,
            epoch: 3,
            author: { userId: "alice" },
        });
        expect(results[1]).toEqual({
            ok: false,
            code: GroupErrorCode.ENVELOPE_WRONG_AUTHOR,
            details: { userId: "bob", pubKey: "PKB" },
        });
        expect(results[2]).toEqual({
            ok: false,
            code: GroupErrorCode.ENVELOPE_WRONG_KIND,
            details: { envelopeKind: "anonymous" },
        });
    });

    it("SECURITY: one item without an expected author fails the call before anything is read", async () => {
        const { api, native } = setup({ decryptMany: [] });
        await expect(
            api.decryptMany("g1", [
                { location, envelope: utf8("e"), options: { expectedAuthor: "alice" } },
                { location, envelope: utf8("e"), options: {} as never },
            ]),
        ).rejects.toThrow(TypeError);
        expect(native.decryptMany).not.toHaveBeenCalled();
    });
});

describe("GroupApi: writers and readers outside the Group", () => {
    it("encryptAsOutsider forwards (ptr, [contextId, groupId, location, content, options])", async () => {
        const { api, native } = setup();
        const content = utf8("x");
        await api.encryptAsOutsider("ctx", "g1", location, content);
        expect(native.encryptAsOutsider).toHaveBeenCalledWith(PTR, [
            "ctx",
            "g1",
            nativeLocation,
            content,
            { alsoFor: [] },
        ]);
    });

    it("encryptAnonymously forwards (ptr, [groupId, groupPubKey, location, content])", async () => {
        const { api, native } = setup();
        const content = utf8("x");
        await api.encryptAnonymously("g1", "GPK", location, content);
        expect(native.encryptAnonymously).toHaveBeenCalledWith(PTR, [
            "g1",
            "GPK",
            nativeLocation,
            content,
        ]);
    });

    it("decryptFromOutsider returns a sender, never an author", async () => {
        const { api } = setup({
            decryptFromOutsider: {
                data: utf8("r"),
                keyVersion: 2,
                sender: { userId: "analyzer", pubKey: "PK" },
                encryptedAt: 5,
                sharedWith: { groups: [], users: [] },
            },
        });
        const result = await api.decryptFromOutsider("g1", location, utf8("e"), {
            expectedAuthor: "analyzer",
        });
        expect(result.sender).toEqual({ userId: "analyzer", pubKey: "PK" });
        expect(result.epoch).toBe(2);
        expect("author" in result).toBe(false);
    });

    it("decryptAnonymous names nobody", async () => {
        const { api, native } = setup({
            decryptAnonymous: { data: utf8("r"), keyVersion: 1 },
        });
        const result = await api.decryptAnonymous("g1", location, utf8("e"));
        expect(native.decryptAnonymous).toHaveBeenCalledWith(PTR, [
            "g1",
            nativeLocation,
            utf8("e"),
        ]);
        expect(Object.keys(result).sort()).toEqual(["data", "epoch"]);
    });

    it("SECURITY: decryptShared says 'member' only when the core does", async () => {
        const shared = {
            data: utf8("d"),
            sender: { userId: "bob", pubKey: "PK" },
            homeGroupId: "care",
            via: "billing",
            encryptedAt: 5,
            sharedWith: { groups: ["billing"], users: [] as string[] },
        };
        for (const [core, expected] of [
            ["member", true],
            ["notMember", false],
            ["unknown", "unknown"],
            ["", "unknown"],
            ["MEMBER", "unknown"],
        ] as const) {
            const { api } = setup({
                decryptShared: { ...shared, senderMembership: core },
            });
            const result = await api.decryptShared("ctx", location, utf8("e"), {
                expectedAuthor: "bob",
            });
            expect(result.senderIsMember).toBe(expected);
            expect(result.via).toBe("billing");
        }
    });

    it("the three signed reads refuse options without an expected author", async () => {
        const { api, native } = setup();
        await expect(
            api.decryptFromOutsider("g1", location, utf8("e"), {} as never),
        ).rejects.toThrow(TypeError);
        await expect(api.decryptShared("ctx", location, utf8("e"), {} as never)).rejects.toThrow(
            TypeError,
        );
        expect(native.decryptFromOutsider).not.toHaveBeenCalled();
        expect(native.decryptShared).not.toHaveBeenCalled();
    });
});

describe("GroupApi: Groups", () => {
    it("createGroup forwards the seed and the visibility, 'members' by default", async () => {
        const { api, native } = setup({ createGroup: "gid" });
        const users = [{ userId: "u", pubKey: "p" }];
        const pub = utf8("pub");
        const priv = utf8("priv");
        await api.createGroup("ctx", users, users, pub, priv);
        expect(native.createGroup).toHaveBeenLastCalledWith(PTR, [
            "ctx",
            users,
            users,
            pub,
            priv,
            undefined,
            undefined,
            "members",
        ]);
        const seed = utf8("contact/chat/42");
        await api.createGroup("ctx", users, users, pub, priv, undefined, {
            idSeed: seed,
            visibleTo: "context",
        });
        expect(native.createGroup).toHaveBeenLastCalledWith(PTR, [
            "ctx",
            users,
            users,
            pub,
            priv,
            undefined,
            seed,
            "context",
        ]);
    });

    it("a removal and a rotation return the epoch they made", async () => {
        const { api, native } = setup({ removeGroupMembers: 2, rotateGroupKey: 3 });
        expect(await api.removeGroupMembers("g1", ["bob"])).toBe(2);
        expect(native.removeGroupMembers).toHaveBeenCalledWith(PTR, ["g1", ["bob"]]);
        expect(await api.rotateGroupKey("g1")).toBe(3);
    });

    it("getGroups reports each Group on its own", async () => {
        const group = { groupId: "g1" };
        const { api } = setup({
            getGroups: [
                { statusCode: 0, group },
                { statusCode: 123, group: {} },
            ],
        });
        expect(await api.getGroups(["g1", "gone"])).toEqual([
            { ok: true, group },
            { ok: false, code: 123 },
        ]);
    });

    it("getGroupPublicKey and peekEnvelope call an epoch an epoch", async () => {
        const { api } = setup({
            getGroupPublicKey: { groupId: "g1", keyVersion: 4, pubKey: "GPK" },
            peekEnvelope: {
                version: 3,
                groupId: "g1",
                keyVersion: 4,
                fromOutsider: false,
                isSigned: true,
                isFile: false,
                hasLocation: true,
                authorUserId: "alice",
                alsoForGroups: [{ groupId: "g2", keyVersion: 9 }],
                alsoForUsers: ["carol"],
            },
        });
        expect(await api.getGroupPublicKey("ctx", "g1")).toEqual({
            groupId: "g1",
            epoch: 4,
            pubKey: "GPK",
        });
        expect(await api.peekEnvelope(utf8("e"))).toEqual({
            version: 3,
            groupId: "g1",
            epoch: 4,
            fromOutsider: false,
            isSigned: true,
            isFile: false,
            hasLocation: true,
            authorUserId: "alice",
            alsoForGroups: [{ groupId: "g2", epoch: 9 }],
            alsoForUsers: ["carol"],
        });
    });

    it("deriveGroupId and setGroupVisibility forward their arguments", async () => {
        const { api, native } = setup({ deriveGroupId: "derived" });
        const seed = utf8("contact/chat/42");
        expect(await api.deriveGroupId("ctx", seed)).toBe("derived");
        expect(native.deriveGroupId).toHaveBeenCalledWith(PTR, ["ctx", seed]);
        await api.setGroupVisibility("g1", "context");
        expect(native.setGroupVisibility).toHaveBeenCalledWith(PTR, ["g1", "context"]);
    });
});
