/**
 * GroupClient: Groups and Spaces by subject. It adds no cryptography, so what
 * is checked here is what it decides on its own: which Group a subject names,
 * where a value is bound, and when it refuses to use a Group somebody else may
 * have put under a subject.
 */

import { describe, expect, it, vi, type Mock } from "vitest";
import { GroupClient, GroupClientError } from "../GroupClient.js";
import { NO_LOCATION, id, toNativePath, type Location } from "../groupPaths.js";
import { GroupErrorCode } from "../../native/NativeErrorCodes.js";
import type { GroupApi } from "../GroupApi.js";

const CTX = "ctx";
const ALICE = { userId: "alice", pubKey: "PKA" };
const BOB = { userId: "bob", pubKey: "PKB" };
const ENVELOPE = new Uint8Array([9]);
const DATA = new Uint8Array([1]);
const BY_ALICE = { expectedAuthor: "alice" };

const seedOf = (path: Location) => new TextEncoder().encode(JSON.stringify(toNativePath(path).map((s) => [s.isId, [...s.value]])));
const idOf = (kind: string, path: Location) => `${kind}:${new TextDecoder().decode(seedOf(path))}`;

function groupState(over: Record<string, unknown> = {}) {
    return { contextId: CTX, groupId: "g", creator: "alice", users: ["bob"], managers: ["alice"], policy: {}, ...over };
}

/** A GroupApi that answers from `returns` and remembers every call. */
async function collect<T>(readable: ReadableStream<T>): Promise<T[]> {
    const all: T[] = [];
    await readable.pipeTo(new WritableStream({ write: (chunk) => void all.push(chunk) }));
    return all;
}

function setup(returns: Record<string, unknown> = {}) {
    const calls: Record<string, Mock> = {};
    const base: Record<string, (...args: never[]) => unknown> = {
        encodePath: async (path: Location) => seedOf(path),
        deriveGroupId: async (_ctx: string, seed: Uint8Array) => `group:${new TextDecoder().decode(seed)}`,
        deriveSpaceId: async (_ctx: string, seed: Uint8Array) => `space:${new TextDecoder().decode(seed)}`,
    };
    const api = new Proxy({} as Record<string, Mock>, {
        get: (_t, name: string) =>
            (calls[name] ??= vi.fn(async (...args: never[]) => {
                const value = name in returns ? returns[name] : base[name]?.(...args);
                if (value instanceof Error) throw value;
                return typeof value === "function" ? (value as (...a: never[]) => unknown)(...args) : value;
            })),
    });
    const events = { subscribe: vi.fn().mockResolvedValue(["s1", "s2"]), unsubscribe: vi.fn().mockResolvedValue(undefined) };
    const groups = new GroupClient(api as unknown as GroupApi, CTX, async () => events as never);
    return { groups, api, events };
}

const CHAT: Location = ["chat-app", "chat", id("c1")];
const BILLING: Location = ["clinic", "billing"];
const codeOf = async (p: Promise<unknown>) => p.then(() => 0, (e: unknown) => (e as { code?: number }).code ?? (e instanceof TypeError ? "TypeError" : -1));

describe("GroupClient: creating", () => {
    it("create binds the Group to the subject, and the Group's id follows from it", async () => {
        const { groups, api } = setup({ createGroup: "made" });
        const created = await groups.create(CHAT, [
            { user: ALICE, role: "manager" },
            { user: BOB, role: "user" },
        ], { privateMeta: DATA });
        expect(created.groupId).toBe("made");
        expect(created.subject).toEqual(CHAT);
        const [ctx, users, managers, publicMeta, privateMeta, policy, options] = api.createGroup.mock.lastCall!;
        expect([ctx, users, managers]).toEqual([CTX, [BOB], [ALICE]]);
        expect(publicMeta).toEqual(new Uint8Array(0));
        expect(privateMeta).toBe(DATA);
        expect(policy).toBeUndefined();
        expect(options).toEqual({ idSeed: seedOf(CHAT), visibleTo: "members" });
    });

    it("create turns a taken subject into GROUP_ALREADY_EXISTS, and passes the rules as policy", async () => {
        const taken = Object.assign(new Error("dup"), { name: "DuplicateResourceIdException", code: 0xe6138 });
        expect(await codeOf(setup({ createGroup: taken }).groups.create(CHAT, [{ user: ALICE, role: "manager" }]))).toBe(
            GroupErrorCode.GROUP_ALREADY_EXISTS,
        );
        const other = new Error("network");
        await expect(setup({ createGroup: other }).groups.create(CHAT, [])).rejects.toBe(other);
        const { groups, api } = setup({ createGroup: "g" });
        await groups.create(CHAT, [{ user: ALICE, role: "manager" }], {
            rules: { addMembers: "user", removeMembers: "manager", updateMeta: "manager" },
            visibleTo: "context",
        });
        expect(api.createGroup.mock.lastCall![5]).toEqual({ addMembers: "user", removeMembers: "manager", update: "manager" });
        expect(api.createGroup.mock.lastCall![6].visibleTo).toBe("context");
        await expect(groups.create(CHAT, [{ user: ALICE, role: "admin" }])).rejects.toThrow(TypeError);
    });

    it("createImmutable makes every member a manager and freezes the roster, the roles and the rules", async () => {
        const { groups, api } = setup({ createGroup: "dm" });
        await groups.createImmutable(CHAT, [ALICE, BOB]);
        const [, users, managers, , , policy] = api.createGroup.mock.lastCall!;
        expect(users).toEqual([]);
        expect(managers).toEqual([ALICE, BOB]);
        expect(policy).toEqual({ addMembers: "none", removeMembers: "none", updatePolicy: "none" });
    });
});

describe("GroupClient: opening", () => {
    const first = (author: string) => ({ totalAvailable: 3, readItems: [{ author }] });

    it("open derives the id, verifies the Group, and checks the creator against the first signed statement", async () => {
        const { groups, api } = setup({ getGroup: groupState({ creator: "mallory" }), getGroupLog: first("alice") });
        const chat = await groups.open(CHAT, { createdBy: "alice" });
        expect(chat.groupId).toBe(idOf("group", CHAT));
        expect(api.getGroup).toHaveBeenCalledWith(idOf("group", CHAT));
        expect(api.getGroupLog).toHaveBeenCalledWith("g", { skip: 0, limit: 1, sortOrder: "asc" });
        // The Bridge's `creator` field said mallory; the signed history said alice, and that is what counts.
        expect(await codeOf(groups.open(CHAT, { createdBy: "mallory" }))).toBe(GroupErrorCode.GROUP_WRONG_CREATOR);
        // Without an expectation nothing is asked of the log.
        api.getGroupLog.mockClear();
        await groups.open(CHAT);
        expect(api.getGroupLog).not.toHaveBeenCalled();
    });

    it("a Group that does not verify is not opened", async () => {
        const failed = Object.assign(new Error("fork"), { code: GroupErrorCode.GROUP_HISTORY_FORK });
        expect(await codeOf(setup({ getGroup: failed }).groups.open(CHAT))).toBe(GroupErrorCode.GROUP_HISTORY_FORK);
        await expect(setup({ getGroup: groupState({ contextId: "other" }) }).groups.open(CHAT)).rejects.toThrow(TypeError);
    });

    it("an immutable Group opens only for someone who names exactly its members", async () => {
        const frozen = { addMembers: "none", removeMembers: "none", updatePolicy: "none" };
        const fixed = groupState({ users: [], managers: ["alice", "bob"], policy: frozen });
        const { groups } = setup({ getGroup: fixed });
        await expect(groups.open(CHAT, { immutableMembers: ["bob", "alice"] })).resolves.toBeDefined();
        for (const members of [["alice"], ["alice", "carol"], ["alice", "bob", "carol"]]) {
            expect(await codeOf(groups.open(CHAT, { immutableMembers: members }))).toBe(GroupErrorCode.GROUP_MEMBERSHIP_MISMATCH);
        }
        expect(await codeOf(groups.open(CHAT))).toBe(GroupErrorCode.GROUP_MEMBERSHIP_MISMATCH);
        // The creator or the roster, never both: the types say so, and so does the call.
        expect(await codeOf(groups.open(CHAT, { createdBy: "alice", immutableMembers: ["alice", "bob"] } as never))).toBe("TypeError");
        // The right two users in a Group that is not frozen: somebody can still be added to it.
        for (const state of [
            groupState({ users: [], managers: ["alice", "bob"], policy: { ...frozen, addMembers: "manager" } }),
            groupState({ users: [], managers: ["alice", "bob"], policy: { ...frozen, updatePolicy: undefined } }),
            groupState({ users: ["bob"], managers: ["alice"], policy: frozen }),
        ]) {
            expect(await codeOf(setup({ getGroup: state }).groups.open(CHAT, { immutableMembers: ["alice", "bob"] }))).toBe(
                GroupErrorCode.GROUP_MEMBERSHIP_MISMATCH,
            );
        }
    });

    it("openPinned ties the Group's own id to the subject on the device", async () => {
        const { groups, api } = setup({ getGroup: groupState() });
        const room = await groups.openPinned(CHAT, "legacy");
        expect(room.groupId).toBe("legacy");
        expect(api.pinGroupToSubject).toHaveBeenCalledWith(CTX, CHAT, "legacy");
        const rebound = Object.assign(new Error("rebound"), { code: GroupErrorCode.GROUP_SUBJECT_REBOUND });
        expect(await codeOf(setup({ getGroup: groupState(), pinGroupToSubject: rebound }).groups.openPinned(CHAT, "other"))).toBe(
            GroupErrorCode.GROUP_SUBJECT_REBOUND,
        );
    });

    it("openPinned with createdBy checks the signed creator before pinning", async () => {
        const { groups, api } = setup({ getGroup: groupState(), getGroupLog: first("alice") });
        await groups.openPinned(CHAT, "legacy", { createdBy: "alice" });
        expect(api.pinGroupToSubject).toHaveBeenCalledTimes(1);
        expect(await codeOf(groups.openPinned(CHAT, "legacy", { createdBy: "mallory" }))).toBe(GroupErrorCode.GROUP_WRONG_CREATOR);
        expect(api.pinGroupToSubject).toHaveBeenCalledTimes(1);
    });

    it("openMany reads the states once and reports each Group on its own", async () => {
        const other: Location = ["chat-app", "chat", id("c2")];
        const { groups, api } = setup({
            getGroups: [
                { ok: true, group: groupState() },
                { ok: true, group: groupState() },
                { ok: false, code: 123 },
                { ok: true, group: groupState() },
            ],
            getGroupLog: first("alice"),
        });
        const opened = await groups.openMany([
            { subject: CHAT, createdBy: "alice" },
            { subject: other, createdBy: "bob" },
            { subject: other },
            { subject: other, pinnedGroupId: "legacy" },
        ]);
        expect(api.getGroups).toHaveBeenCalledTimes(1);
        expect(api.getGroups).toHaveBeenCalledWith([idOf("group", CHAT), idOf("group", other), idOf("group", other), "legacy"]);
        expect(opened.map((o) => ("group" in o ? o.group.groupId : o.code))).toEqual([
            idOf("group", CHAT),
            GroupErrorCode.GROUP_WRONG_CREATOR,
            123,
            "legacy",
        ]);
    });

    it("openMany refuses immutableMembers next to createdBy or pinnedGroupId, item by item", async () => {
        const frozen = { addMembers: "none", removeMembers: "none", updatePolicy: "none" };
        const fixed = { ok: true, group: groupState({ users: [], managers: ["alice", "bob"], policy: frozen }) };
        const { groups, api } = setup({ getGroups: [fixed, fixed, fixed] });
        const opened = await groups.openMany([
            { subject: CHAT, immutableMembers: ["alice", "bob"], createdBy: "alice" },
            { subject: CHAT, immutableMembers: ["alice", "bob"], pinnedGroupId: "legacy" },
            { subject: CHAT, immutableMembers: ["alice", "bob"] },
        ]);
        expect(opened.map((o) => o.ok)).toEqual([false, false, true]);
        expect(api.pinGroupToSubject).not.toHaveBeenCalled();
    });

    it("an unbound Group takes a full location, or none when that is said", async () => {
        const { groups, api } = setup({ createGroup: "room", getGroup: groupState() });
        const room = await groups.createUnbound([{ user: ALICE, role: "manager" }]);
        expect(room.subject).toBeUndefined();
        expect(api.createGroup.mock.lastCall![6].idSeed).toBeUndefined();
        await room.encrypt(NO_LOCATION, DATA);
        expect(api.encrypt).toHaveBeenLastCalledWith("room", NO_LOCATION, DATA, { alsoFor: [] });
        await (await groups.openUnbound("room")).decrypt(CHAT, ENVELOPE, BY_ALICE);
        expect(api.decrypt).toHaveBeenLastCalledWith("room", CHAT, ENVELOPE, BY_ALICE);
    });
});

describe("Group: values at subject + place", () => {
    async function chat(returns: Record<string, unknown> = {}) {
        const s = setup({ getGroup: groupState(), ...returns });
        return { ...s, group: await s.groups.open(CHAT) };
    }

    it("every value is bound to the subject and the place", async () => {
        const { group, api } = await chat();
        const place = ["message", id("m1"), "body"] as const;
        const location = [...CHAT, ...place];
        await group.encrypt(place, DATA);
        expect(api.encrypt).toHaveBeenCalledWith(group.groupId, location, DATA, { alsoFor: [] });
        await group.decrypt(place, ENVELOPE, BY_ALICE);
        expect(api.decrypt).toHaveBeenCalledWith(group.groupId, location, ENVELOPE, BY_ALICE);
        await group.decryptMany([{ place, envelope: ENVELOPE, options: BY_ALICE }]);
        expect(api.decryptMany).toHaveBeenCalledWith(group.groupId, [{ location, envelope: ENVELOPE, options: BY_ALICE }]);
        await group.decryptFromOutsider(place, ENVELOPE, BY_ALICE);
        expect(api.decryptFromOutsider).toHaveBeenCalledWith(group.groupId, location, ENVELOPE, BY_ALICE);
        await group.decryptAnonymous(place, ENVELOPE);
        expect(api.decryptAnonymous).toHaveBeenCalledWith(group.groupId, location, ENVELOPE);
        await group.openFile(place, ENVELOPE, { ...BY_ALICE, from: 5 });
        expect(api.openFile).toHaveBeenCalledWith(group.groupId, location, ENVELOPE, { ...BY_ALICE, from: 5 });
        await group.encryptFile(place);
        expect(api.sealFile).toHaveBeenCalledWith({ groupId: group.groupId, location, alsoFor: [] });
    });

    it("a place is said: no location under a subject would put every value at one spot", async () => {
        const { group, api } = await chat();
        await expect(group.encrypt(NO_LOCATION as never, DATA)).rejects.toThrow(TypeError);
        await expect(group.encrypt([] as never, DATA)).rejects.toThrow(TypeError);
        await expect(group.decrypt(undefined as never, ENVELOPE, BY_ALICE)).rejects.toThrow(TypeError);
        expect(api.encrypt).not.toHaveBeenCalled();
        expect(api.decrypt).not.toHaveBeenCalled();
    });

    it("a further reader named by subject is named with its creator, and the Group's signed policy must agree", async () => {
        const key = (creator: string) => ({ groupId: "b", epoch: 1, pubKey: "PUB", creator });
        const { group, api } = await chat({ getGroupPublicKey: key("bob") });
        await group.encrypt(["discharge", id("d1")], DATA, {
            alsoFor: [{ subject: BILLING, createdBy: "bob" }, { group: "audit" }, { user: ALICE }],
        });
        expect(api.getGroupPublicKey).toHaveBeenCalledWith(CTX, idOf("group", BILLING));
        expect(api.encrypt.mock.lastCall![3]).toEqual({
            alsoFor: [{ group: idOf("group", BILLING) }, { group: "audit" }, { user: ALICE }],
        });
        // Somebody else made a Group called "billing" first: nothing is wrapped for it.
        api.encrypt.mockClear();
        expect(await codeOf(group.encrypt(["discharge", id("d1")], DATA, { alsoFor: [{ subject: BILLING, createdBy: "alice" }] }))).toBe(
            GroupErrorCode.GROUP_WRONG_CREATOR,
        );
        await expect(
            group.encrypt(["discharge", id("d1")], DATA, { alsoFor: [{ subject: BILLING } as never] }),
        ).rejects.toThrow(TypeError);
        await expect(group.encryptFile(["scan", id("s1")], { alsoFor: [{ subject: BILLING, createdBy: "alice" }] })).rejects.toBeInstanceOf(
            GroupClientError,
        );
        expect(api.encrypt).not.toHaveBeenCalled();
        expect(api.sealFile).not.toHaveBeenCalled();
    });

    it("membership calls forward to the Group and return the epoch the core made", async () => {
        const { group, api } = await chat({ removeGroupMembers: 2, replaceGroupMemberKeys: 3, rotateGroupKey: 4 });
        await group.add([{ user: BOB, role: "user" }]);
        expect(api.addGroupMembers).toHaveBeenCalledWith(group.groupId, [{ user: BOB, role: "user" }]);
        await expect(group.remove(["bob"])).resolves.toBe(2);
        await expect(group.replaceMemberKey(["bob"])).resolves.toBe(3);
        await expect(group.rotateKey()).resolves.toBe(4);
        await group.setRoles([{ userId: "bob", role: "manager" }]);
        expect(api.setGroupRoles).toHaveBeenCalledWith(group.groupId, [{ userId: "bob", role: "manager" }]);
        await group.updateRules({ addMembers: "user" });
        expect(api.updateGroupRules).toHaveBeenCalledWith(group.groupId, { addMembers: "user" });
        await group.setVisibility("context");
        expect(api.setGroupVisibility).toHaveBeenCalledWith(group.groupId, "context");
    });

    it("a sequence is written as a stream: items and marks out in order, close signs the end", async () => {
        const header = new Uint8Array([7]);
        const item = new Uint8Array([10]);
        const autoMark = new Uint8Array([11]);
        const mark = new Uint8Array([12]);
        const end = new Uint8Array([13]);
        const { group, api } = await chat({
            beginSequence: 5,
            getSequenceHeader: header,
            appendToSequence: { item, mark: autoMark },
            checkpointSequence: mark,
            finishSequence: end,
        });
        const place = ["ops", id("s1")] as const;
        const enc = await group.encryptSequence(place, { checkpointEvery: 8 });
        expect(enc.header).toBe(header);
        expect(api.beginSequence).toHaveBeenCalledWith(group.groupId, [...CHAT, ...place], 8);
        const packets = collect(enc.readable);
        const w = enc.writable.getWriter();
        await w.write(DATA);
        await enc.checkpoint();
        await w.close();
        expect(await packets).toEqual([item, autoMark, mark, end]);
        expect(api.appendToSequence).toHaveBeenCalledWith(5, DATA);
        expect(api.closeSequence).not.toHaveBeenCalled();
    });

    it("an aborted or failed sequence is freed without a signed end", async () => {
        const { group, api } = await chat({ beginSequence: 5, getSequenceHeader: ENVELOPE });
        const aborted = await group.encryptSequence(["ops"]);
        await aborted.writable.abort("gone");
        expect(api.closeSequence).toHaveBeenCalledWith(5);
        expect(api.finishSequence).not.toHaveBeenCalled();

        const stale = Object.assign(new Error("stale"), { code: GroupErrorCode.ENVELOPE_STALE_EPOCH });
        const { group: g2, api: api2 } = await chat({ beginSequence: 6, getSequenceHeader: ENVELOPE, appendToSequence: stale });
        const failing = await g2.encryptSequence(["ops"]);
        void failing.readable.pipeTo(new WritableStream()).catch(() => {});
        await expect(failing.writable.getWriter().write(DATA)).rejects.toBe(stale);
        expect(api2.closeSequence).toHaveBeenCalledWith(6);
        expect(api2.finishSequence).not.toHaveBeenCalled();

        // Begun, but the header could not be read: the handle is freed, the error comes through.
        const broken = new Error("header");
        const { group: g3, api: api3 } = await chat({ beginSequence: 7, getSequenceHeader: broken });
        await expect(g3.encryptSequence(["ops"])).rejects.toBe(broken);
        expect(api3.closeSequence).toHaveBeenCalledWith(7);
    });

    it("a sequence is read as a stream of events; a bad packet is reported, not fatal", async () => {
        const item = new Uint8Array([1]);
        const mark = new Uint8Array([2]);
        const forged = new Uint8Array([3]);
        const refused = Object.assign(new Error("order"), { code: GroupErrorCode.ENVELOPE_SEQUENCE_ORDER });
        const { group, api } = await chat({
            openSequence: 6,
            peekSequenceItem: (p: Uint8Array) => ({ sequenceId: "q", index: 0, isMark: p === mark }),
            readSequenceItem: (_h: number, p: Uint8Array) => {
                if (p === forged) throw refused;
                return { data: DATA, index: 0, missing: 0 };
            },
            verifySequenceMark: { attestedFrom: 0, attestedItems: 1, closed: true },
        });
        const place = ["ops", id("s1")] as const;
        const resumeFrom = new Uint8Array([4]);
        const dec = await group.decryptSequence(place, ENVELOPE, { ...BY_ALICE, resumeFrom });
        expect(api.openSequence).toHaveBeenCalledWith(group.groupId, [...CHAT, ...place], ENVELOPE, { ...BY_ALICE, resumeFrom }, resumeFrom);
        const events = collect(dec.readable);
        const w = dec.writable.getWriter();
        for (const p of [item, forged, mark]) await w.write(p);
        await w.close();
        expect(await events).toEqual([
            { kind: "item", index: 0, data: DATA, missing: 0 },
            { kind: "rejected", error: refused },
            { kind: "verified", from: 0, to: 1, verifiedUpTo: 1, closed: true },
        ]);
        expect([dec.verifiedUpTo, dec.closed]).toEqual([1, true]);
        expect(api.closeSequence).toHaveBeenCalledWith(6);
    });

    it("a mark after a rejected one does not confirm the gap: verifiedUpTo stays at the forged item", async () => {
        const [first, firstMark, forged, badMark, third, closeMark] = [1, 2, 3, 4, 5, 6].map((n) => new Uint8Array([n]));
        const marks = [firstMark, badMark, closeMark];
        const mismatch = Object.assign(new Error("mark"), { code: GroupErrorCode.ENVELOPE_SEQUENCE_ORDER });
        const { group } = await chat({
            openSequence: 6,
            peekSequenceItem: (p: Uint8Array) => ({ sequenceId: "q", index: 0, isMark: marks.includes(p) }),
            readSequenceItem: (_h: number, p: Uint8Array) => ({ data: p, index: [first, forged, third].indexOf(p), missing: 0 }),
            verifySequenceMark: (_h: number, p: Uint8Array) => {
                if (p === firstMark) return { attestedFrom: 0, attestedItems: 1, closed: false };
                if (p === badMark) throw mismatch; // item 1 is not what the author wrote
                return { attestedFrom: 2, attestedItems: 3, closed: true }; // only from the failed mark on
            },
        });
        const dec = await group.decryptSequence(["ops"], ENVELOPE, BY_ALICE);
        const events = collect(dec.readable);
        const w = dec.writable.getWriter();
        for (const p of [first, firstMark, forged, badMark, third, closeMark]) await w.write(p);
        await w.close();
        const all = await events;
        expect(all.map((e) => e.kind)).toEqual(["item", "verified", "item", "rejected", "item", "verified"]);
        expect(all[1]).toEqual({ kind: "verified", from: 0, to: 1, verifiedUpTo: 1, closed: false });
        // Items 2..3 are the author's, but item 1 is not confirmed: the prefix stops there, and the close does not count.
        expect(all[5]).toEqual({ kind: "verified", from: 2, to: 3, verifiedUpTo: 1, closed: false });
        expect([dec.verifiedUpTo, dec.closed]).toEqual([1, false]);
    });

    it("on() subscribes to the Group's changes or to a channel, and returns the way out", async () => {
        const { group, events } = await chat();
        const callback = () => {};
        const off = await group.on("change", callback);
        const subscribed = events.subscribe.mock.lastCall![0];
        expect(subscribed.map((s: { module: string; id: string }) => [s.module, s.id])).toEqual([
            ["group", group.groupId],
            ["group", group.groupId],
        ]);
        await off();
        expect(events.unsubscribe).toHaveBeenCalledWith(["s1", "s2"]);
        await group.on("signal", callback, "typing");
        expect(events.subscribe.mock.lastCall![0][0]).toMatchObject({ module: "groupCustom", type: "typing", id: group.groupId });
        await expect(group.on("signal", callback)).rejects.toThrow(TypeError);
    });
});

describe("GroupClient: from outside a Group", () => {
    const key = (creator: string) => ({ groupId: "care", epoch: 2, pubKey: "PUB", creator });
    const PATIENT: Location = ["clinic", "patient", id("p1")];

    it("a writer outside the Group names who made it, or would write to whoever made one first", async () => {
        const { groups, api } = setup({ getGroupPublicKey: key("alice") });
        const outsider = await groups.openForWriting({ subject: PATIENT, createdBy: "alice" });
        await outsider.encrypt(["lab", id("r1")], DATA);
        expect(api.encryptAsOutsider).toHaveBeenCalledWith(CTX, idOf("group", PATIENT), [...PATIENT, "lab", id("r1")], DATA, {
            alsoFor: [],
        });
        expect(await codeOf(groups.openForWriting({ subject: PATIENT, createdBy: "mallory" }))).toBe(
            GroupErrorCode.GROUP_WRONG_CREATOR,
        );
        await expect(groups.openForWriting({ subject: PATIENT, createdBy: "" })).rejects.toThrow(TypeError);
        expect(await codeOf(groups.publicKeyOf({ subject: PATIENT, createdBy: "mallory" }))).toBe(GroupErrorCode.GROUP_WRONG_CREATOR);
        await expect(groups.publicKeyOf({ subject: PATIENT, createdBy: "alice" })).resolves.toEqual(key("alice"));
    });

    it("an anonymous writer makes no request and has no further recipients", async () => {
        const { groups, api } = setup();
        const writer = await groups.anonymousWriter({ ...key("alice"), groupId: idOf("group", PATIENT) }, PATIENT);
        await writer.encrypt(["intake", id("i1")], DATA);
        expect(api.encryptAnonymously).toHaveBeenCalledWith(idOf("group", PATIENT), "PUB", [...PATIENT, "intake", id("i1")], DATA);
        expect(api.getGroupPublicKey).not.toHaveBeenCalled();
        await expect(writer.encrypt(["intake", id("i1")], DATA, { alsoFor: [{ user: ALICE }] })).rejects.toThrow(TypeError);
        await writer.encryptFile(["intake", id("i1"), "scan"]);
        expect(api.sealFileAnonymously).toHaveBeenCalledWith({
            groupId: idOf("group", PATIENT),
            groupPubKey: "PUB",
            location: [...PATIENT, "intake", id("i1"), "scan"],
        });
        // A key of another Group is not taken for this subject's.
        expect(await codeOf(groups.anonymousWriter(key("alice"), PATIENT))).toBe(GroupErrorCode.ENVELOPE_WRONG_GROUP);
    });

    it("a shared value must say it was written in the Group of the subject it was found under", async () => {
        const header = (groupId: string) => ({ groupId });
        const { groups, api } = setup({ peekEnvelope: header(idOf("group", PATIENT)), getGroupPublicKey: key("alice") });
        const read = { ...BY_ALICE, homeCreatedBy: "alice" };
        await groups.decryptShared(PATIENT, ["discharge", id("d1")], ENVELOPE, read);
        expect(api.decryptShared).toHaveBeenCalledWith(CTX, [...PATIENT, "discharge", id("d1")], ENVELOPE, read);
        // Who made the author's Group is said, or said not to matter: it is never left out.
        await expect(groups.decryptShared(PATIENT, ["discharge", id("d1")], ENVELOPE, BY_ALICE as never)).rejects.toThrow(TypeError);
        await expect(groups.decryptShared(PATIENT, ["discharge", id("d1")], ENVELOPE, { ...BY_ALICE, homeCreatedBy: null })).resolves.toBeUndefined();
        expect(await codeOf(groups.decryptShared(PATIENT, ["discharge", id("d1")], ENVELOPE, { ...BY_ALICE, homeCreatedBy: "mallory" }))).toBe(
            GroupErrorCode.GROUP_WRONG_CREATOR,
        );
        // Another patient's summary put in this patient's row: its header names another Group.
        const moved = setup({ peekEnvelope: header("group:someone-else") });
        expect(await codeOf(moved.groups.decryptShared(PATIENT, ["discharge", id("d1")], ENVELOPE, { ...BY_ALICE, homeCreatedBy: null }))).toBe(
            GroupErrorCode.ENVELOPE_WRONG_GROUP,
        );
        expect(await codeOf(moved.groups.openSharedFile(PATIENT, ["scan", id("s1")], ENVELOPE, { ...BY_ALICE, homeCreatedBy: null }))).toBe(
            GroupErrorCode.ENVELOPE_WRONG_GROUP,
        );
        expect(moved.api.decryptShared).not.toHaveBeenCalled();
        expect(moved.api.openSharedFile).not.toHaveBeenCalled();
    });
});

describe("GroupClient: Spaces", () => {
    const PROJECT: Location = ["crm", "project", id("p1")];
    const SALES: Location = ["crm", "team", id("sales")];
    const key = (creator: string) => ({ groupId: "x", epoch: 1, pubKey: "PUB", creator });
    const state = (createdBy: string) => ({ spaceId: "s", contextId: CTX, createdBy });

    it("createSpaceFor seeds the id with the subject and names recipient Groups with their creators", async () => {
        const { groups, api } = setup({ createSpace: "made", getGroupPublicKey: key("alice") });
        const space = await groups.createSpaceFor(PROJECT, [
            { subject: SALES, createdBy: "alice", role: "manager" },
            { user: BOB, role: "user" },
        ]);
        expect(space.spaceId).toBe("made");
        const [ctx, recipients, , , seed] = api.createSpace.mock.lastCall!;
        expect(ctx).toBe(CTX);
        expect(recipients).toEqual([
            { group: idOf("group", SALES), role: "manager" },
            { user: BOB, role: "user" },
        ]);
        expect(seed).toEqual(seedOf(PROJECT));
        expect(await codeOf(groups.createSpaceFor(PROJECT, [{ subject: SALES, createdBy: "mallory", role: "user" }]))).toBe(
            GroupErrorCode.GROUP_WRONG_CREATOR,
        );
        const taken = Object.assign(new Error("dup"), { code: 0x6138 });
        expect(await codeOf(setup({ createSpace: taken }).groups.createSpaceFor(PROJECT, [{ user: BOB, role: "manager" }]))).toBe(
            GroupErrorCode.GROUP_ALREADY_EXISTS,
        );
    });

    it("openSpace reads the Space under the subject and checks who made it", async () => {
        const { groups, api } = setup({ getSpace: state("alice") });
        const space = await groups.openSpace(PROJECT, { createdBy: "alice" });
        expect(space.spaceId).toBe(idOf("space", PROJECT));
        expect(api.getSpace).toHaveBeenCalledWith(idOf("space", PROJECT));
        expect(await codeOf(groups.openSpace(PROJECT, { createdBy: "bob" }))).toBe(GroupErrorCode.GROUP_WRONG_CREATOR);
        await space.encrypt(["note", id("n1")], DATA);
        expect(api.encryptInSpace).toHaveBeenCalledWith(space.spaceId, [...PROJECT, "note", id("n1")], DATA);
        await space.decrypt(["note", id("n1")], ENVELOPE, BY_ALICE);
        expect(api.decryptInSpace).toHaveBeenCalledWith(space.spaceId, [...PROJECT, "note", id("n1")], ENVELOPE, BY_ALICE);
        await expect(space.encrypt(NO_LOCATION as never, DATA)).rejects.toThrow(TypeError);
    });

    it("a recipient Group leaves by its subject; a sequence read from a Space says who wrote it", async () => {
        const origin = { author: ALICE, via: "sales", authorAccess: "unknown", keyVersion: 1 };
        const { groups, api } = setup({ getSpace: state("alice"), removeSpaceRecipients: 3, openSequenceInSpace: 6, getSpaceSequenceOrigin: origin });
        const space = await groups.openSpace(PROJECT);
        await expect(space.removeRecipients([{ subject: SALES }, { userId: "bob" }, { group: "g9" }])).resolves.toBe(3);
        expect(api.removeSpaceRecipients).toHaveBeenCalledWith(space.spaceId, [
            { group: idOf("group", SALES) },
            { userId: "bob" },
            { group: "g9" },
        ]);
        const reader = await space.decryptSequence(["ops"], ENVELOPE, BY_ALICE);
        expect(reader.spaceOrigin).toEqual(origin);
        expect(api.getSpaceSequenceOrigin).toHaveBeenCalledWith(6);

        const broken = new Error("origin");
        const failing = setup({ getSpace: state("alice"), openSequenceInSpace: 9, getSpaceSequenceOrigin: broken });
        await expect((await failing.groups.openSpace(PROJECT)).decryptSequence(["ops"], ENVELOPE, BY_ALICE)).rejects.toBe(broken);
        expect(failing.api.closeSequence).toHaveBeenCalledWith(9);
    });

    it("a Space seals and opens files at subject + place", async () => {
        const { groups, api } = setup({ getSpace: state("alice"), beginFileEncryptionInSpace: 7, beginFileDecryptionInSpace: 8 });
        const space = await groups.openSpace(PROJECT);
        const location = [...PROJECT, "scan", id("s1")];
        await space.encryptFile(["scan", id("s1")]);
        expect(api.beginFileEncryptionInSpace).toHaveBeenCalledWith(space.spaceId, location);
        await space.openFile(["scan", id("s1")], ENVELOPE, BY_ALICE);
        expect(api.beginFileDecryptionInSpace).toHaveBeenCalledWith(space.spaceId, location, ENVELOPE, BY_ALICE);
    });

    it("an unbound Space takes a full location, or none", async () => {
        const { groups, api } = setup({ createSpace: "u", getSpace: state("alice") });
        const space = await groups.createUnboundSpace([{ user: ALICE, role: "manager" }]);
        expect(api.createSpace.mock.lastCall!.length).toBe(4);
        await space.encrypt(NO_LOCATION, DATA);
        expect(api.encryptInSpace).toHaveBeenCalledWith("u", NO_LOCATION, DATA);
        await expect(setup({ getSpace: { ...state("alice"), contextId: "other" } }).groups.openUnboundSpace("u")).rejects.toThrow(TypeError);
    });

    it("onChange subscribes to this Space's changes and its deletion", async () => {
        const { groups, events } = setup({ getSpace: state("alice") });
        const space = await groups.openSpace(PROJECT);
        const off = await space.onChange(() => {});
        expect(events.subscribe.mock.lastCall![0]).toMatchObject([
            { module: "group", type: 4, selector: 2, id: space.spaceId },
            { module: "group", type: 5, selector: 2, id: space.spaceId },
        ]);
        await off();
        expect(events.unsubscribe).toHaveBeenCalledWith(["s1", "s2"]);
    });
});
