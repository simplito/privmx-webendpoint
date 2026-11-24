import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { setupUsers } from "../test-utils";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

/**
 * Group API v2 in a real browser, against a real Bridge: the built WASM, its
 * bindings and the TypeScript layer together. The unit tests check each layer
 * on a stand-in for the one below; only here does a value sealed by one user
 * really come out, or really get refused, for another.
 *
 * Every body runs inside the page, so it reaches the SDK through
 * `window.PrivmxWebEndpoint` and returns plain data for the assertions.
 */
test.describe("GroupApiV2", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    const argsOf = (backend: { bridgeUrl: string }, users: unknown) => ({
        bridgeUrl: backend.bridgeUrl,
        solutionId: testData.solutionId,
        contextId: testData.contextId,
        users: users as Record<string, { privKey: string; id: string; pubKey: string }>,
    });

    test("Two users exchange an envelope bound to its place", async ({ page, backend, cli }) => {
        const args = argsOf(backend, await setupUsers(page, cli));
        const r = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const lib = (window as any).PrivmxWebEndpoint;
            const { id, NO_LOCATION, ANY_AUTHOR, GroupErrorCode } = lib;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const codeOf = (p: Promise<unknown>) =>
                p.then(
                    () => 0,
                    (e: any) => e?.code ?? (e instanceof TypeError ? "TypeError" : String(e)),
                );
            const u = (x: { id: string; pubKey: string }) => ({ userId: x.id, pubKey: x.pubKey });
            const connect = async (x: { privKey: string }) => {
                const conn = await lib.Endpoint.connect(x.privKey, solutionId, bridgeUrl);
                return lib.Endpoint.createGroupApi(conn);
            };
            const api1 = await connect(users.u1);
            const api2 = await connect(users.u2);
            const api3 = await connect(users.u3);

            const groupId = await api1.createGroup(
                contextId,
                [u(users.u2)],
                [u(users.u1)],
                enc.encode("pub"),
                enc.encode("priv"),
            );
            const at = (messageId: string) => ["chat-app", "message", id(messageId), "body"];
            const sealed = await api1.encrypt(groupId, at("m1"), enc.encode("hello"));
            const opened = await api2.decrypt(groupId, at("m1"), sealed, {
                expectedAuthor: users.u1.id,
            });
            const header = await api2.peekEnvelope(sealed);

            // Without a location, said out loud.
            const unbound = await api1.encrypt(groupId, NO_LOCATION, enc.encode("unbound"));

            // From someone with no seat in the Group: the Group's public key is all they need.
            const group = await api1.getGroup(groupId);
            const anonymous = await api3.encryptAnonymously(
                groupId,
                group.groupPubKey,
                at("tip"),
                enc.encode("a tip"),
            );
            return {
                data: dec.decode(opened.data),
                author: opened.author,
                epoch: opened.epoch,
                header: { groupId: header.groupId, hasLocation: header.hasLocation, isFile: header.isFile },
                sameGroup: header.groupId === groupId,
                anyAuthor: (await api2.decrypt(groupId, at("m1"), sealed, { expectedAuthor: ANY_AUTHOR }))
                    .author.userId,
                movedTo: await codeOf(api2.decrypt(groupId, at("m2"), sealed, { expectedAuthor: users.u1.id })),
                noLocation: await codeOf(api2.decrypt(groupId, NO_LOCATION, sealed, { expectedAuthor: users.u1.id })),
                wrongAuthor: await codeOf(api2.decrypt(groupId, at("m1"), sealed, { expectedAuthor: users.u2.id })),
                noAuthor: await codeOf(api2.decrypt(groupId, at("m1"), sealed, {} as any)),
                unbound: dec.decode(
                    (await api2.decrypt(groupId, NO_LOCATION, unbound, { expectedAuthor: users.u1.id })).data,
                ),
                unboundAtAPlace: await codeOf(
                    api2.decrypt(groupId, at("m1"), unbound, { expectedAuthor: users.u1.id }),
                ),
                anonymous: dec.decode((await api2.decryptAnonymous(groupId, at("tip"), anonymous)).data),
                anonymousAsMember: await codeOf(
                    api2.decrypt(groupId, at("tip"), anonymous, { expectedAuthor: ANY_AUTHOR }),
                ),
                outsiderReads: await codeOf(api3.decryptAnonymous(groupId, at("tip"), anonymous)),
                codes: {
                    location: GroupErrorCode.ENVELOPE_WRONG_LOCATION,
                    author: GroupErrorCode.ENVELOPE_WRONG_AUTHOR,
                    kind: GroupErrorCode.ENVELOPE_WRONG_KIND,
                },
                u1: users.u1,
            };
        }, args);

        expect(r.data).toEqual("hello");
        expect(r.author).toEqual({ userId: r.u1.id, pubKey: r.u1.pubKey, role: "manager" });
        expect(r.epoch).toEqual(1);
        expect(r.sameGroup).toBe(true);
        expect(r.header.hasLocation).toBe(true);
        expect(r.header.isFile).toBe(false);
        expect(r.anyAuthor).toEqual(r.u1.id);
        expect(r.movedTo).toEqual(r.codes.location);
        expect(r.noLocation).toEqual(r.codes.location);
        expect(r.wrongAuthor).toEqual(r.codes.author);
        expect(r.noAuthor).toEqual("TypeError");
        expect(r.unbound).toEqual("unbound");
        expect(r.unboundAtAPlace).toEqual(r.codes.location);
        expect(r.anonymous).toEqual("a tip");
        expect(r.anonymousAsMember).toEqual(r.codes.kind);
        expect(r.outsiderReads).not.toEqual(0);
    });

    test("A role change is seen by the other member, and the log says who did what", async ({
        page,
        backend,
        cli,
    }) => {
        const args = argsOf(backend, await setupUsers(page, cli));
        const r = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const lib = (window as any).PrivmxWebEndpoint;
            const enc = new TextEncoder();
            const u = (x: { id: string; pubKey: string }) => ({ userId: x.id, pubKey: x.pubKey });
            const connect = async (x: { privKey: string }) => {
                const conn = await lib.Endpoint.connect(x.privKey, solutionId, bridgeUrl);
                return lib.Endpoint.createGroupApi(conn);
            };
            const api1 = await connect(users.u1);
            const groupId = await api1.createGroup(
                contextId,
                [u(users.u2)],
                [u(users.u1)],
                enc.encode("pub"),
                enc.encode("priv"),
            );
            await api1.setGroupRoles(groupId, [{ userId: users.u2.id, role: "manager" }]);

            // A session of the second user that has seen nothing before: it verifies the change itself.
            const api2 = await connect(users.u2);
            const seen = await api2.getGroup(groupId);
            // A manager now: adding a member is theirs to do.
            await api2.addGroupMembers(groupId, [{ user: u(users.u3), role: "user" }]);
            const epoch = await api2.removeGroupMembers(groupId, [users.u3.id]);
            const log = await api1.getGroupLog(groupId, { skip: 0, limit: 10, sortOrder: "asc" });
            return {
                managers: [...seen.managers].sort(),
                users: seen.users,
                epoch,
                log: log.readItems.map((e: any) => [e.seq, e.kind, e.author, e.epoch]),
                ids: [users.u1.id, users.u2.id],
            };
        }, args);

        expect(r.managers).toEqual([...r.ids].sort());
        expect(r.users).toEqual([]);
        expect(r.epoch).toEqual(2);
        expect(r.log).toEqual([
            [1, "create", r.ids[0], 1],
            [2, "roles", r.ids[0], 1],
            [3, "add", r.ids[1], 1],
            [4, "remove", r.ids[1], 2],
        ]);
    });

    test("A file as a stream: any size, a range, and a rewritten chunk is refused", async ({
        page,
        backend,
        cli,
    }) => {
        const args = argsOf(backend, await setupUsers(page, cli));
        const r = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const lib = (window as any).PrivmxWebEndpoint;
            const { id, GroupErrorCode } = lib;
            const enc = new TextEncoder();
            const u = (x: { id: string; pubKey: string }) => ({ userId: x.id, pubKey: x.pubKey });
            const connect = async (x: { privKey: string }) => {
                const conn = await lib.Endpoint.connect(x.privKey, solutionId, bridgeUrl);
                return lib.Endpoint.createGroupApi(conn);
            };
            // Read by hand: `new Response(stream)` turns the stream's own error into "Failed to fetch".
            const bytesOf = async (stream: ReadableStream<Uint8Array>) => {
                const reader = stream.getReader();
                const parts: Uint8Array[] = [];
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    parts.push(value);
                }
                const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
                let at = 0;
                for (const part of parts) {
                    out.set(part, at);
                    at += part.length;
                }
                return out;
            };
            const streamOf = (bytes: Uint8Array) => new Blob([bytes as BlobPart]).stream();
            const same = (a: Uint8Array, b: Uint8Array) =>
                a.length === b.length && a.every((byte, i) => byte === b[i]);
            const codeOf = (p: Promise<unknown>) => p.then(() => 0, (e: any) => e?.code ?? String(e));

            const api1 = await connect(users.u1);
            const api2 = await connect(users.u2);
            const groupId = await api1.createGroup(
                contextId,
                [u(users.u2)],
                [u(users.u1)],
                enc.encode("pub"),
                enc.encode("priv"),
            );
            const location = ["scans", "scan", id("s1")];
            const plaintext = new Uint8Array(300_000);
            for (let i = 0; i < plaintext.length; ++i) plaintext[i] = i % 251;

            // No size up front: the envelope is made when the stream ends.
            const sealer = api1.sealFile({ groupId, location });
            const cipher = await bytesOf(streamOf(plaintext).pipeThrough(sealer));
            const envelope: Uint8Array = await sealer.envelope;
            const by1 = { expectedAuthor: users.u1.id };

            const whole = await api2.openFile(groupId, location, envelope, by1);
            const read = await bytesOf(streamOf(cipher).pipeThrough(whole.stream));
            const info = await whole.info;

            const ranged = await api2.openFile(groupId, location, envelope, { ...by1, from: 150_000, length: 1000 });
            const { offset, length } = ranged.cipherRange;
            const part = await bytesOf(streamOf(cipher.slice(offset, offset + length)).pipeThrough(ranged.stream));
            const rangedInfo = await ranged.info;

            // A member rewrites a byte of the stored ciphertext.
            const rewritten = cipher.slice();
            rewritten[200_000] ^= 1;
            const tampered = await api2.openFile(groupId, location, envelope, by1);
            const tamperedRead = await codeOf(bytesOf(streamOf(rewritten).pipeThrough(tampered.stream)));

            // The tail never arrived.
            const cut = await api2.openFile(groupId, location, envelope, by1);
            await bytesOf(streamOf(cipher.slice(0, cipher.length / 2)).pipeThrough(cut.stream)).catch(() => {});
            const cutInfo = await codeOf(cut.info);

            return {
                isFile: (await api2.peekEnvelope(envelope)).isFile,
                cipherLonger: cipher.length > plaintext.length,
                roundTrip: same(read, plaintext),
                info: { author: info.author?.userId, size: info.size, complete: info.complete },
                rangeIsSmall: length < cipher.length / 2,
                rangeRight: same(part, plaintext.slice(150_000, 151_000)),
                rangedComplete: rangedInfo.complete,
                tamperedRead,
                cutInfo,
                elsewhere: await codeOf(api2.openFile(groupId, ["scans", "scan", id("s2")], envelope, by1)),
                asMessage: await codeOf(api2.decrypt(groupId, location, envelope, by1)),
                codes: {
                    corrupted: GroupErrorCode.ENVELOPE_FILE_CORRUPTED,
                    truncated: GroupErrorCode.ENVELOPE_TRUNCATED_FILE,
                    location: GroupErrorCode.ENVELOPE_WRONG_LOCATION,
                },
                u1: users.u1.id,
            };
        }, args);

        expect(r.isFile).toBe(true);
        expect(r.cipherLonger).toBe(true);
        expect(r.roundTrip).toBe(true);
        expect(r.info).toEqual({ author: r.u1, size: 300_000, complete: true });
        expect(r.rangeIsSmall).toBe(true);
        expect(r.rangeRight).toBe(true);
        expect(r.rangedComplete).toBe(false);
        expect(r.tamperedRead).toEqual(r.codes.corrupted);
        expect(r.cutInfo).toEqual(r.codes.truncated);
        expect(r.elsewhere).toEqual(r.codes.location);
        expect(r.asMessage).not.toEqual(0);
    });

    test("A sequence: items in order, checkpoints, and an end with its epoch", async ({
        page,
        backend,
        cli,
    }) => {
        const args = argsOf(backend, await setupUsers(page, cli));
        const r = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const lib = (window as any).PrivmxWebEndpoint;
            const { id, GroupErrorCode } = lib;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u = (x: { id: string; pubKey: string }) => ({ userId: x.id, pubKey: x.pubKey });
            const connect = async (x: { privKey: string }) => {
                const conn = await lib.Endpoint.connect(x.privKey, solutionId, bridgeUrl);
                return lib.Endpoint.createGroupApi(conn);
            };
            const codeOf = (p: Promise<unknown>) => p.then(() => 0, (e: any) => e?.code ?? String(e));

            const api1 = await connect(users.u1);
            const api2 = await connect(users.u2);
            const groupId = await api1.createGroup(
                contextId,
                [u(users.u2), u(users.u3)],
                [u(users.u1)],
                enc.encode("pub"),
                enc.encode("priv"),
            );
            const location = ["docs", "doc", id("d1"), "ops"];
            const writer = await api1.beginSequence(groupId, location, 2);
            const header = await api1.getSequenceHeader(writer);
            const a = await api1.appendToSequence(writer, enc.encode("a"));
            const b = await api1.appendToSequence(writer, enc.encode("b"));
            const c = await api1.appendToSequence(writer, enc.encode("c"));

            // A removal ends the sequence: the removed member still knows its key.
            await api1.removeGroupMembers(groupId, [users.u3.id]);
            const afterRemoval = await codeOf(api1.appendToSequence(writer, enc.encode("d")));
            const close = await api1.finishSequence(writer);

            const reader = await api2.openSequence(groupId, location, header, { expectedAuthor: users.u1.id });
            const first = await api2.readSequenceItem(reader, a.item);
            const second = await api2.readSequenceItem(reader, b.item);
            const checkpoint = await api2.verifySequenceMark(reader, b.mark);
            const replayed = await codeOf(api2.readSequenceItem(reader, a.item));
            const third = await api2.readSequenceItem(reader, c.item);
            const end = await api2.verifySequenceMark(reader, close);

            // A reader who lost one item is told, and the author's mark does not vouch for what they read.
            const lossy = await api2.openSequence(groupId, location, header, { expectedAuthor: users.u1.id });
            const skipped = await api2.readSequenceItem(lossy, b.item);
            const unattested = await codeOf(api2.verifySequenceMark(lossy, b.mark));

            return {
                marks: [!!a.mark, !!b.mark, !!c.mark],
                read: [first, second, third].map((item) => [dec.decode(item.data), item.index, item.missing]),
                checkpoint,
                end,
                afterRemoval,
                replayed,
                skippedMissing: skipped.missing,
                unattested,
                sameSequence:
                    (await api2.peekEnvelope(header)).sequenceId === (await api2.peekSequenceItem(c.item)).sequenceId,
                elsewhere: await codeOf(
                    api2.openSequence(groupId, ["docs", "doc", id("d2"), "ops"], header, { expectedAuthor: users.u1.id }),
                ),
                codes: {
                    stale: GroupErrorCode.ENVELOPE_STALE_EPOCH,
                    order: GroupErrorCode.ENVELOPE_SEQUENCE_ORDER,
                    location: GroupErrorCode.ENVELOPE_WRONG_LOCATION,
                },
            };
        }, args);

        expect(r.marks).toEqual([false, true, false]);
        expect(r.read).toEqual([
            ["a", 0, 0],
            ["b", 1, 0],
            ["c", 2, 0],
        ]);
        expect(r.checkpoint).toEqual({ attestedItems: 2, closed: false });
        expect(r.end).toEqual({ attestedItems: 3, closed: true });
        expect(r.afterRemoval).toEqual(r.codes.stale);
        expect(r.replayed).toEqual(r.codes.order);
        expect(r.skippedMissing).toEqual(1);
        expect(r.unattested).toEqual(r.codes.order);
        expect(r.sameSequence).toBe(true);
        expect(r.elsewhere).toEqual(r.codes.location);
    });

    test("GroupClient: a Group named by its entity, and who may have made it", async ({
        page,
        backend,
        cli,
    }) => {
        const args = argsOf(backend, await setupUsers(page, cli));
        const r = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const lib = (window as any).PrivmxWebEndpoint;
            const { id, NO_LOCATION, GroupErrorCode } = lib;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u = (x: { id: string; pubKey: string }) => ({ userId: x.id, pubKey: x.pubKey });
            const codeOf = (p: Promise<unknown>) =>
                p.then(
                    () => 0,
                    (e: any) => e?.code ?? (e instanceof TypeError ? "TypeError" : String(e)),
                );
            const connect = async (x: { privKey: string }) => {
                const conn = await lib.Endpoint.connect(x.privKey, solutionId, bridgeUrl);
                return { groups: await conn.groups(contextId), api: await lib.Endpoint.createGroupApi(conn) };
            };
            const c1 = await connect(users.u1);
            const c2 = await connect(users.u2);

            // A new chat: its id is made at random right before its Group.
            const subject = ["chat-app", "chat", id(crypto.randomUUID())];
            const created = await c1.groups.create(
                subject,
                [
                    { user: u(users.u1), role: "manager" },
                    { user: u(users.u2), role: "user" },
                ],
                { privateMeta: enc.encode("Design") },
            );
            const place = ["message", id("m1"), "body"];
            const body = await created.encrypt(place, enc.encode("hello"));

            const chat = await c2.groups.open(subject, { createdBy: users.u1.id });
            const opened = await chat.decrypt(place, body, { expectedAuthor: users.u1.id });

            // A 1:1 chat named by its two users.
            const dm = ["chat-app", "dm", id(users.u1.id), id(users.u2.id)];
            await c1.groups.createFixed(dm, [u(users.u1), u(users.u2)]);
            const dmState = await (await c2.groups.open(dm, { fixedMembers: [users.u2.id, users.u1.id] })).state();

            // A Group with an id of its own, tied to a subject on this device.
            const legacyId = await c1.api.createGroup(contextId, [u(users.u2)], [u(users.u1)], enc.encode(""), enc.encode(""));
            const otherId = await c1.api.createGroup(contextId, [], [u(users.u1)], enc.encode(""), enc.encode(""));
            const room = ["chat-app", "room", id("r1")];
            const pinned = await c1.groups.openPinned(room, legacyId);

            // No entity at all.
            const unbound = await c1.groups.createUnbound([
                { user: u(users.u1), role: "manager" },
                { user: u(users.u2), role: "user" },
            ]);
            const plain = await unbound.encrypt(NO_LOCATION, enc.encode("room talk"));
            const unboundRead = await (await c2.groups.openUnbound(unbound.groupId)).decrypt(NO_LOCATION, plain, {
                expectedAuthor: users.u1.id,
            });

            return {
                sameId: chat.groupId === created.groupId && chat.groupId === (await c2.groups.groupIdOf(subject)),
                data: dec.decode(opened.data),
                meta: dec.decode((await chat.state()).privateMeta),
                wrongCreator: await codeOf(c2.groups.open(subject, { createdBy: users.u3.id })),
                taken: await codeOf(c2.groups.create(subject, [{ user: u(users.u2), role: "manager" }])),
                noPlace: await codeOf(created.encrypt(NO_LOCATION, enc.encode("x"))),
                dmManagers: [...dmState.managers].sort(),
                dmOthers: await codeOf(c2.groups.open(dm, { fixedMembers: [users.u2.id, users.u3.id] })),
                dmAsOrdinary: await codeOf(c2.groups.open(dm)),
                dmFrozen: await codeOf(
                    (await c1.groups.open(dm, { fixedMembers: [users.u1.id, users.u2.id] })).add([{ user: u(users.u3), role: "user" }]),
                ),
                pinnedId: pinned.groupId === legacyId,
                rebound: await codeOf(c1.groups.openPinned(room, otherId)),
                pinnedAgain: await codeOf(c1.groups.openPinned(room, legacyId)),
                unbound: dec.decode(unboundRead.data),
                codes: {
                    creator: GroupErrorCode.GROUP_WRONG_CREATOR,
                    exists: GroupErrorCode.GROUP_ALREADY_EXISTS,
                    mismatch: GroupErrorCode.GROUP_MEMBERSHIP_MISMATCH,
                    rebound: GroupErrorCode.GROUP_SUBJECT_REBOUND,
                },
                ids: [users.u1.id, users.u2.id],
            };
        }, args);

        expect(r.sameId).toBe(true);
        expect(r.data).toEqual("hello");
        expect(r.meta).toEqual("Design");
        expect(r.wrongCreator).toEqual(r.codes.creator);
        expect(r.taken).toEqual(r.codes.exists);
        expect(r.noPlace).toEqual("TypeError");
        expect(r.dmManagers).toEqual([...r.ids].sort());
        expect(r.dmOthers).toEqual(r.codes.mismatch);
        expect(r.dmAsOrdinary).toEqual(r.codes.mismatch);
        expect(r.dmFrozen).not.toEqual(0);
        expect(r.pinnedId).toBe(true);
        expect(r.rebound).toEqual(r.codes.rebound);
        expect(r.pinnedAgain).toEqual(0);
        expect(r.unbound).toEqual("room talk");
    });

    test("GroupClient: a sequence and a Space file as streams", async ({ page, backend, cli }) => {
        const args = argsOf(backend, await setupUsers(page, cli));
        const r = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const lib = (window as any).PrivmxWebEndpoint;
            const { id } = lib;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u = (x: { id: string; pubKey: string }) => ({ userId: x.id, pubKey: x.pubKey });
            const connect = async (x: { privKey: string }) =>
                (await lib.Endpoint.connect(x.privKey, solutionId, bridgeUrl)).groups(contextId);
            const collect = async (readable: ReadableStream<any>) => {
                const all: any[] = [];
                await readable.pipeTo(new WritableStream({ write: (c) => void all.push(c) }));
                return all;
            };
            const g1 = await connect(users.u1);
            const g2 = await connect(users.u2);
            const members = [
                { user: u(users.u1), role: "manager" },
                { user: u(users.u2), role: "user" },
            ];

            // A sequence: three items, a mark every two, a manual mark, a signed end.
            const doc = ["docs", "doc", id(crypto.randomUUID())];
            const group = await g1.create(doc, members);
            const writer = await group.encryptSequence(["ops"], { checkpointEvery: 2 });
            const packets = collect(writer.readable);
            const w = writer.writable.getWriter();
            for (const op of ["a", "b", "c"]) await w.write(enc.encode(op));
            await writer.checkpoint();
            await w.close();
            const sent: Uint8Array[] = await packets;

            const reader = await (await g2.open(doc)).decryptSequence(["ops"], writer.header, { expectedAuthor: users.u1.id });
            const events = collect(reader.readable);
            const rw = reader.writable.getWriter();
            for (const p of [...sent, sent[0]]) await rw.write(p); // the first item again, at the end
            await rw.close();
            const seen = (await events).map((e: any) =>
                e.kind === "item" ? `item:${e.index}:${dec.decode(e.data)}` : e.kind === "verified" ? `verified:${e.verifiedUpTo}:${e.closed}` : e.kind,
            );

            // A file in a Space.
            const project = ["crm", "project", id(crypto.randomUUID())];
            const space = await g1.createSpaceFor(project, members);
            const sealer = await space.encryptFile(["scan"]);
            const cipher = new Blob(await collect(new Blob([enc.encode("scan bytes")]).stream().pipeThrough(sealer)));
            const envelope = await sealer.envelope;
            const opened = await (await g2.openSpace(project)).openFile(["scan"], envelope, { expectedAuthor: users.u1.id });
            const plain = await collect(cipher.stream().pipeThrough(opened.stream));
            return { packets: sent.length, seen, file: dec.decode(await new Blob(plain).arrayBuffer()) };
        }, args);

        // a, b, mark(2), c, manual mark(3), end(3)
        expect(r.packets).toBe(6);
        expect(r.seen).toEqual([
            "item:0:a",
            "item:1:b",
            "verified:2:false",
            "item:2:c",
            "verified:3:false",
            "verified:3:true",
            "rejected",
        ]);
        expect(r.file).toEqual("scan bytes");
    });

    test("A Space: one key for two teams, its signed history, and a key replaced after a removal", async ({
        page,
        backend,
        cli,
    }) => {
        const args = argsOf(backend, await setupUsers(page, cli));
        const r = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const lib = (window as any).PrivmxWebEndpoint;
            const { id, GroupErrorCode } = lib;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u = (x: { id: string; pubKey: string }) => ({ userId: x.id, pubKey: x.pubKey });
            const codeOf = (p: Promise<unknown>) => p.then(() => 0, (e: any) => e?.code ?? String(e));
            const connect = async (x: { privKey: string }) => {
                const conn = await lib.Endpoint.connect(x.privKey, solutionId, bridgeUrl);
                return conn.groups(contextId);
            };
            const g1 = await connect(users.u1);
            const g2 = await connect(users.u2);
            const g3 = await connect(users.u3);

            const sales = ["crm", "team", id("sales")];
            const support = ["crm", "team", id("support")];
            const project = ["crm", "project", id("p1")];
            const salesGroup = await g1.create(
                sales,
                [
                    { user: u(users.u1), role: "manager" },
                    { user: u(users.u2), role: "user" },
                ],
                { visibleTo: "context" },
            );
            await g3.create(support, [{ user: u(users.u3), role: "manager" }], { visibleTo: "context" });

            // Each team is named with who made it: somebody else's "support" gets no key.
            const squatted = await codeOf(
                g1.createSpaceFor(project, [
                    { subject: sales, createdBy: users.u1.id, role: "manager" },
                    { subject: support, createdBy: users.u2.id, role: "user" },
                ]),
            );
            const space = await g1.createSpaceFor(project, [
                { subject: sales, createdBy: users.u1.id, role: "manager" },
                { subject: support, createdBy: users.u3.id, role: "user" },
            ]);
            const place = ["note", id("n1")];
            const note = await space.encrypt(place, enc.encode("call the client"));

            const forSales = await (await g2.openSpace(project, { createdBy: users.u1.id })).decrypt(place, note, {
                expectedAuthor: users.u1.id,
            });
            const forSupport = await (await g3.openSpace(project)).decrypt(place, note, {
                expectedAuthor: users.u1.id,
            });
            const wrongCreator = await codeOf(g3.openSpace(project, { createdBy: users.u3.id }));

            // Support listens: the Bridge tells every recipient that something about the Space moved.
            const heard: string[] = [];
            const stopListening = await (await g3.openSpace(project)).onChange((e: any) => {
                heard.push(`${e.data.changeKind}:${e.data.keyVersion}`);
            });

            // User 2 leaves sales and still holds the Space's key: it is stale until somebody replaces it.
            await salesGroup.remove([users.u2.id]);
            const stale = (await space.state()).keyIsStale;
            const version = await space.rotateKey();
            const after = await space.encrypt(["note", id("n2")], enc.encode("new terms"));
            const state = await space.state();
            const log = await space.log({ skip: 0, limit: 10, sortOrder: "asc" });
            for (let i = 0; i < 50 && heard.length < 2; i++) await new Promise((r) => setTimeout(r, 100));
            await stopListening();

            return {
                squatted,
                forSales: [dec.decode(forSales.data), forSales.origin.via === salesGroup.groupId, forSales.origin.authorAccess],
                forSupport: [dec.decode(forSupport.data), forSupport.origin.via === salesGroup.groupId, forSupport.origin.authorAccess],
                wrongCreator,
                stale,
                version,
                state: { createdBy: state.createdBy, keyVersion: state.keyVersion, keyIsStale: state.keyIsStale, groups: state.groups.length },
                log: log.readItems.map((e: any) => [e.seq, e.kind, e.author, e.via === salesGroup.groupId, e.keyVersion]),
                heard,
                removedReads: await codeOf(g2.openSpace(project)),
                supportReadsNew: dec.decode(
                    (await (await g3.openSpace(project)).decrypt(["note", id("n2")], after, { expectedAuthor: users.u1.id })).data,
                ),
                codes: { creator: GroupErrorCode.GROUP_WRONG_CREATOR },
                u1: users.u1.id,
            };
        }, args);

        expect(r.squatted).toEqual(r.codes.creator);
        // Sales is visible to the Context, so support sees its signed roster as well.
        expect(r.forSales).toEqual(["call the client", true, "yes"]);
        expect(r.forSupport).toEqual(["call the client", true, "yes"]);
        expect(r.wrongCreator).toEqual(r.codes.creator);
        expect(r.stale).toBe(true);
        expect(r.version).toEqual(2);
        expect(r.state).toEqual({ createdBy: r.u1, keyVersion: 2, keyIsStale: false, groups: 2 });
        expect(r.log).toEqual([
            [1, "create", r.u1, true, 1],
            [2, "rotate", r.u1, true, 2],
        ]);
        expect(r.heard).toEqual(["keyStale:1", "keyRotated:2"]);
        expect(r.removedReads).not.toEqual(0);
        expect(r.supportReadsNew).toEqual("new terms");
    });

    test("A pin store in IndexedDB: what was verified survives a new connection", async ({ page, backend, cli }) => {
        const args = argsOf(backend, await setupUsers(page, cli));
        const r = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const lib = (window as any).PrivmxWebEndpoint;
            const { id } = lib;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u = (x: { id: string; pubKey: string }) => ({ userId: x.id, pubKey: x.pubKey });
            const dbName = `pins-${crypto.randomUUID()}`;
            const bytes = (...v: number[]) => new Uint8Array(v);

            // The store alone: a write goes through only against the value it expects.
            const store = new lib.IndexedDbPinStore(dbName);
            const cas = [
                await store.save("k", bytes(1), bytes()),
                await store.save("k", bytes(2), bytes()),
                [...(await store.load("k"))],
                await store.save("k", bytes(2), bytes(1)),
                [...(await store.load("missing"))],
            ];

            // Behind a connection: every load and save the library makes is noted.
            const session = async () => {
                const seen: string[] = [];
                const conn = await lib.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const inner = new lib.IndexedDbPinStore(dbName);
                await conn.setPinStore({
                    load: async (key: string) => {
                        const blob = await inner.load(key);
                        seen.push(`load:${key.split("/")[0]}:${blob.length > 0}`);
                        return blob;
                    },
                    save: async (key: string, blob: Uint8Array, expected: Uint8Array) => {
                        const stored = await inner.save(key, blob, expected);
                        seen.push(`save:${key.split("/")[0]}:${stored}`);
                        return stored;
                    },
                });
                return { conn, seen, groups: await conn.groups(contextId) };
            };
            const subject = ["chat-app", "chat", id("pinned")];
            const place = ["message", id("m1")];
            const first = await session();
            const group = await first.groups.create(subject, [{ user: u(users.u1), role: "manager" }]);
            const sealed = await group.encrypt(place, enc.encode("kept"));
            await first.conn.disconnect();

            const second = await session();
            const again = await second.groups.open(subject, { createdBy: users.u1.id });
            const opened = await again.decrypt(place, sealed, { expectedAuthor: users.u1.id });
            return { cas, first: first.seen, second: second.seen, text: dec.decode(opened.data) };
        }, args);

        expect(r.cas).toEqual([true, false, [1], true, []]);
        // The first session finds nothing and saves what it verified; the second starts from that.
        expect(r.first).toContain("save:group-pins:true");
        expect(r.second).toContain("load:group-pins:true");
        expect(r.text).toEqual("kept");
    });
});
