import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { GroupEventSelectorType, SortOrder } from "../../src/Types";
import { setupUsers } from "../test-utils";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

test.describe("GroupTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    // =========================================================================
    // GROUP CRUD
    // =========================================================================

    test("Creating and getting a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi = await Endpoint.createGroupApi(connection);

            const groupId = await groupApi.createGroup(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("group_public"),
                enc.encode("group_private"),
            );

            const group = await groupApi.getGroup(groupId);
            return {
                groupId,
                group: {
                    ...group,
                    publicMeta: dec.decode(group.publicMeta),
                    privateMeta: dec.decode(group.privateMeta),
                },
            };
        }, args);

        expect(result.group.groupId).toEqual(result.groupId);
        expect(result.group.contextId).toEqual(testData.contextId);
        expect(result.group.statusCode).toEqual(0);
        expect(result.group.publicMetaVersion).toEqual(1);
        expect(result.group.privateMetaVersion).toEqual(1);
        expect(result.group.rosterVersion).toEqual(1);
        expect(result.group.keyVersion).toEqual(1);
        expect(result.group.groupPubKey).not.toEqual("");
        expect(result.group.publicMeta).toEqual("group_public");
        expect(result.group.privateMeta).toEqual("group_private");
        expect(result.group.users).toHaveLength(2);
        expect(result.group.managers).toEqual([users.u1.id]);
    });

    test("Creating a group with invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            // user_1's id paired with user_2's key - the Bridge must reject the mismatch.
            const mismatched = { userId: users.u1.id, pubKey: users.u2.pubKey };

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi = await Endpoint.createGroupApi(connection);

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            const pub = enc.encode("p");
            const priv = enc.encode("p");

            // Invalid contextId
            await expectError(() =>
                groupApi.createGroup("invalid_id", [u1Obj], [u1Obj], pub, priv),
            );
            // User pubKey does not match the userId
            await expectError(() =>
                groupApi.createGroup(contextId, [mismatched], [u1Obj], pub, priv),
            );
            // Manager pubKey does not match the userId
            await expectError(() =>
                groupApi.createGroup(contextId, [u1Obj], [mismatched], pub, priv),
            );
            // No managers
            await expectError(() => groupApi.createGroup(contextId, [u1Obj], [], pub, priv));
        }, args);
    });

    test("Listing groups with valid/invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi = await Endpoint.createGroupApi(connection);

            const g1 = await groupApi.createGroup(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p1"),
                enc.encode("p1"),
            );
            const g2 = await groupApi.createGroup(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p2"),
                enc.encode("p2"),
            );

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(() =>
                groupApi.listGroups("invalid", { skip: 0, limit: 10, sortOrder: "desc" }),
            );
            await expectError(() =>
                groupApi.listGroups(contextId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "invalid" as SortOrder,
                }),
            );

            const all = await groupApi.listGroups(contextId, {
                skip: 0,
                limit: 100,
                sortOrder: "desc",
            });
            const page1 = await groupApi.listGroups(contextId, {
                skip: 0,
                limit: 1,
                sortOrder: "desc",
            });
            return { g1, g2, all, page1 };
        }, args);

        expect(result.all.totalAvailable).toBeGreaterThanOrEqual(2);
        const listedIds = result.all.readItems.map((g) => g.groupId);
        expect(listedIds).toContain(result.g1);
        expect(listedIds).toContain(result.g2);
        // A summary carries identity, roster and epoch - but no metadata to decrypt.
        for (const summary of result.all.readItems) {
            expect(summary.contextId).toEqual(testData.contextId);
            expect(summary.groupPubKey).not.toEqual("");
            expect(summary.keyVersion).toBeGreaterThanOrEqual(1);
        }
        expect(result.page1.readItems).toHaveLength(1);
        expect(result.page1.totalAvailable).toBeGreaterThanOrEqual(2);
    });

    test("Updating a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi = await Endpoint.createGroupApi(connection);

            const groupId = await groupApi.createGroup(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("v1"),
                enc.encode("v1_priv"),
            );

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // Unknown groupId
            await expectError(() => groupApi.updateGroupPublicMeta(contextId, enc.encode("x"), 1));
            await expectError(() => groupApi.updateGroupPrivateMeta(contextId, enc.encode("x"), 1));
            await expectError(() => groupApi.updateGroupPolicy(contextId, { get: "all" }));
            // A stale version cannot be forced past: there is no force flag any more,
            // and an update computed against a moved head produces no tag a reader
            // would accept.
            await expectError(() => groupApi.updateGroupPublicMeta(groupId, enc.encode("x"), 99));
            await expectError(() => groupApi.updateGroupPrivateMeta(groupId, enc.encode("x"), 99));

            // Each plane has its own call, its own permission and its own counter.
            await groupApi.updateGroupPublicMeta(groupId, enc.encode("v2"), 1);
            const publicUpdated = await groupApi.getGroup(groupId);

            await groupApi.updateGroupPrivateMeta(groupId, enc.encode("v2_priv"), 1);
            const privateUpdated = await groupApi.getGroup(groupId);

            // The policy lives outside the signed metadata, so it moves no counter.
            await groupApi.updateGroupPolicy(groupId, { get: "all" });
            const policyUpdated = await groupApi.getGroup(groupId);

            const snapshot = (group: Awaited<ReturnType<typeof groupApi.getGroup>>) => ({
                statusCode: group.statusCode,
                publicMetaVersion: group.publicMetaVersion,
                privateMetaVersion: group.privateMetaVersion,
                rosterVersion: group.rosterVersion,
                publicMeta: dec.decode(group.publicMeta),
                privateMeta: dec.decode(group.privateMeta),
                users: group.users,
                managers: group.managers,
            });

            return {
                publicUpdated: snapshot(publicUpdated),
                privateUpdated: snapshot(privateUpdated),
                policyUpdated: snapshot(policyUpdated),
            };
        }, args);

        // A public-metadata write moves the public counter alone.
        expect(result.publicUpdated.statusCode).toEqual(0);
        expect(result.publicUpdated.publicMetaVersion).toEqual(2);
        expect(result.publicUpdated.privateMetaVersion).toEqual(1);
        expect(result.publicUpdated.publicMeta).toEqual("v2");
        expect(result.publicUpdated.privateMeta).toEqual("v1_priv");

        // And a private-metadata write moves the private one alone.
        expect(result.privateUpdated.statusCode).toEqual(0);
        expect(result.privateUpdated.publicMetaVersion).toEqual(2);
        expect(result.privateUpdated.privateMetaVersion).toEqual(2);
        expect(result.privateUpdated.privateMeta).toEqual("v2_priv");
        expect(result.privateUpdated.publicMeta).toEqual("v2");

        // Neither touches the roster; the policy call touches nothing at all.
        expect(result.privateUpdated.rosterVersion).toEqual(1);
        expect(result.privateUpdated.users).toEqual([users.u1.id]);
        expect(result.privateUpdated.managers).toEqual([users.u1.id]);
        expect(result.policyUpdated.statusCode).toEqual(0);
        expect(result.policyUpdated.publicMetaVersion).toEqual(2);
        expect(result.policyUpdated.privateMetaVersion).toEqual(2);
        expect(result.policyUpdated.rosterVersion).toEqual(1);
    });

    test("Deleting a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi = await Endpoint.createGroupApi(connection);

            const groupId = await groupApi.createGroup(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await groupApi.deleteGroup(groupId);
            // Gone for good.
            await expectError(() => groupApi.getGroup(groupId));
            // Deleting something that is not a group.
            await expectError(() => groupApi.deleteGroup(contextId));
        }, args);
    });

    test("Group member without management rights can read the group", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi1 = await Endpoint.createGroupApi(conn1);
            const groupId = await groupApi1.createGroup(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("shared_public"),
                enc.encode("shared_private"),
            );

            // user_2 is a member but not a manager.
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const groupApi2 = await Endpoint.createGroupApi(conn2);
            const group = await groupApi2.getGroup(groupId);

            return {
                groupId,
                statusCode: group.statusCode,
                readGroupId: group.groupId,
                publicMeta: dec.decode(group.publicMeta),
                privateMeta: dec.decode(group.privateMeta),
            };
        }, args);

        expect(result.statusCode).toEqual(0);
        expect(result.readGroupId).toEqual(result.groupId);
        expect(result.publicMeta).toEqual("shared_public");
        expect(result.privateMeta).toEqual("shared_private");
    });

    // =========================================================================
    // MEMBERSHIP / KEY EPOCH
    // =========================================================================

    test("Adding a member does not advance the key epoch", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };
            const u3Obj = { userId: users.u3.id, pubKey: users.u3.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi1 = await Endpoint.createGroupApi(conn1);
            const groupId = await groupApi1.createGroup(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("roster_public"),
                enc.encode("roster_private"),
            );
            const before = await groupApi1.getGroup(groupId);

            await groupApi1.addGroupMembers(groupId, [{ user: u3Obj, role: "user" }]);
            const after = await groupApi1.getGroup(groupId);

            // The newcomer can now read the group.
            const conn3 = await Endpoint.connect(users.u3.privKey, solutionId, bridgeUrl);
            const groupApi3 = await Endpoint.createGroupApi(conn3);
            const asNewMember = await groupApi3.getGroup(groupId);

            return {
                beforeKeyVersion: before.keyVersion,
                beforeRosterVersion: before.rosterVersion,
                after: {
                    users: after.users,
                    managers: after.managers,
                    keyVersion: after.keyVersion,
                    rosterVersion: after.rosterVersion,
                },
                newMember: {
                    statusCode: asNewMember.statusCode,
                    privateMeta: dec.decode(asNewMember.privateMeta),
                },
            };
        }, args);

        expect(result.beforeKeyVersion).toEqual(1);
        expect(result.after.users).toHaveLength(3);
        expect(result.after.users).toContain(users.u3.id);
        expect(result.after.managers).toEqual([users.u1.id]);
        // Adding a member costs one wrap - it does not rotate the group key.
        expect(result.after.keyVersion).toEqual(1);
        // The roster counter is the one that moves on a membership change.
        expect(result.beforeRosterVersion).toEqual(1);
        expect(result.after.rosterVersion).toEqual(2);
        expect(result.newMember.statusCode).toEqual(0);
        // The metadata carries through untouched - seating a member is not a metadata edit.
        expect(result.newMember.privateMeta).toEqual("roster_private");
    });

    test("Adding several members at once seats both roles", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };
            const u3Obj = { userId: users.u3.id, pubKey: users.u3.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi1 = await Endpoint.createGroupApi(conn1);
            const groupId = await groupApi1.createGroup(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("batch_public"),
                enc.encode("batch_private"),
            );

            // One delta over the union of both newcomers' paths, one compare-and-swap.
            await groupApi1.addGroupMembers(groupId, [
                { user: u2Obj, role: "user" },
                { user: u3Obj, role: "manager" },
            ]);
            const after = await groupApi1.getGroup(groupId);

            return {
                users: after.users,
                managers: after.managers,
                keyVersion: after.keyVersion,
                rosterVersion: after.rosterVersion,
            };
        }, args);

        expect(result.users).toHaveLength(2);
        expect(result.users).toContain(users.u2.id);
        // A manager is seated in `managers` alone - the two are separate lists,
        // not a roster and a subset of it. The roster is their union, which is
        // also how the Bridge counts members.
        expect(result.users).not.toContain(users.u3.id);
        expect(result.managers).toHaveLength(2);
        expect(result.managers).toContain(users.u3.id);
        // Both seated in one batch: the epoch does not move, and one roster
        // entry covers both.
        expect(result.keyVersion).toEqual(1);
        expect(result.rosterVersion).toEqual(2);
    });

    test("Removing a member advances the key epoch", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };
            const u3Obj = { userId: users.u3.id, pubKey: users.u3.pubKey };

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi = await Endpoint.createGroupApi(connection);
            const groupId = await groupApi.createGroup(
                contextId,
                [u1Obj, u2Obj, u3Obj],
                [u1Obj],
                enc.encode("rotating_public"),
                enc.encode("rotating_private"),
            );
            const before = await groupApi.getGroup(groupId);

            await groupApi.removeGroupMembers(groupId, [users.u3.id]);
            const after = await groupApi.getGroup(groupId);

            return {
                beforeKeyVersion: before.keyVersion,
                after: {
                    statusCode: after.statusCode,
                    users: after.users,
                    keyVersion: after.keyVersion,
                    rosterVersion: after.rosterVersion,
                },
            };
        }, args);

        expect(result.beforeKeyVersion).toEqual(1);
        expect(result.after.statusCode).toEqual(0);
        expect(result.after.users).toHaveLength(2);
        expect(result.after.users).not.toContain(users.u3.id);
        // A removal replaces the path to the root and mints a new epoch key.
        expect(result.after.keyVersion).toEqual(2);
        expect(result.after.rosterVersion).toEqual(2);
    });

    test("The group public key changes with every epoch", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };
            const u3Obj = { userId: users.u3.id, pubKey: users.u3.pubKey };

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi = await Endpoint.createGroupApi(connection);
            const groupId = await groupApi.createGroup(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("pubkey_public"),
                enc.encode("pubkey_private"),
            );
            const snap = async () => {
                const g = await groupApi.getGroup(groupId);
                return { keyVersion: g.keyVersion, groupPubKey: g.groupPubKey };
            };

            const created = await snap();
            await groupApi.addGroupMembers(groupId, [{ user: u3Obj, role: "user" }]);
            const added = await snap();
            await groupApi.removeGroupMembers(groupId, [users.u3.id]);
            const removedOne = await snap();
            await groupApi.removeGroupMembers(groupId, [users.u2.id]);
            const removedTwo = await snap();

            return { created, added, removedOne, removedTwo };
        }, args);

        const { created, added, removedOne, removedTwo } = result;

        // Adding a member moves neither the epoch nor the identity key: the
        // newcomer is wrapped into the tree the group already has.
        expect(added.keyVersion).toEqual(created.keyVersion);
        expect(added.groupPubKey).toEqual(created.groupPubKey);

        // Each removal mints an epoch, and with it a new identity key. The key
        // a link carries is therefore only good for the epoch it came from.
        expect(removedOne.keyVersion).toEqual(created.keyVersion + 1);
        expect(removedOne.groupPubKey).not.toEqual(created.groupPubKey);

        expect(removedTwo.keyVersion).toEqual(created.keyVersion + 2);
        expect(removedTwo.groupPubKey).not.toEqual(removedOne.groupPubKey);
        expect(removedTwo.groupPubKey).not.toEqual(created.groupPubKey);

        // One key per epoch: four snapshots across three epochs, three keys.
        const keys = [created, added, removedOne, removedTwo].map((s) => s.groupPubKey);
        expect(new Set(keys).size).toEqual(3);
    });

    test("An envelope sealed to a superseded group key", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi = await Endpoint.createGroupApi(connection);
            const groupId = await groupApi.createGroup(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("anon_public"),
                enc.encode("anon_private"),
            );
            const before = await groupApi.getGroup(groupId);

            // An outsider with nothing but the link seals one envelope now.
            const guest = await Endpoint.connectPublic(solutionId, bridgeUrl);
            const guestGroups = await Endpoint.createGroupApi(guest);
            const sealedBefore = await guestGroups.encryptAnonymously(
                groupId,
                before.groupPubKey,
                enc.encode("sent before the rotation"),
            );

            // u2 leaves, which mints a new epoch and a new identity key.
            await groupApi.removeGroupMembers(groupId, [users.u2.id]);
            const after = await groupApi.getGroup(groupId);

            // The outsider's link is stale now, and they seal another envelope with it.
            const sealedStale = await guestGroups.encryptAnonymously(
                groupId,
                before.groupPubKey,
                enc.encode("sent with the old key"),
            );

            const open = async (api: typeof groupApi, envelope: Uint8Array) => {
                try {
                    const opened = await api.decrypt(envelope);
                    return { ok: true, text: dec.decode(opened.data), error: "" };
                } catch (e) {
                    return { ok: false, text: "", error: (e as Error).message.trim() };
                }
            };

            // The member who left, on a session opened after the removal.
            const exConn = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const exGroupApi = await Endpoint.createGroupApi(exConn);

            return {
                keyChanged: after.groupPubKey !== before.groupPubKey,
                memberOpensOld: await open(groupApi, sealedBefore),
                memberOpensStale: await open(groupApi, sealedStale),
                removedMemberOpensStale: await open(exGroupApi, sealedStale),
            };
        }, args);

        expect(result.keyChanged).toBe(true);

        // A member keeps reading envelopes addressed to superseded keys, so a
        // link published before a removal does not stop working.
        expect(result.memberOpensOld.ok).toBe(true);
        expect(result.memberOpensOld.text).toEqual("sent before the rotation");
        expect(result.memberOpensStale.ok).toBe(true);
        expect(result.memberOpensStale.text).toEqual("sent with the old key");

        // The member who left cannot, even though the envelope is addressed to
        // the key that existed while they were still in. Key resolution runs
        // against current membership, not against the epoch on the envelope.
        expect(result.removedMemberOpensStale.ok).toBe(false);
        expect(result.removedMemberOpensStale.error).toMatch(/Access denied/i);
    });

    test("Removing several members at once advances the epoch once", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };
            const u3Obj = { userId: users.u3.id, pubKey: users.u3.pubKey };

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi = await Endpoint.createGroupApi(connection);
            const groupId = await groupApi.createGroup(
                contextId,
                [u1Obj, u2Obj, u3Obj],
                [u1Obj],
                enc.encode("batch_removal_public"),
                enc.encode("batch_removal_private"),
            );

            // This is why the batch exists: two leavers, one epoch.
            await groupApi.removeGroupMembers(groupId, [users.u2.id, users.u3.id]);
            const after = await groupApi.getGroup(groupId);

            return {
                statusCode: after.statusCode,
                users: after.users,
                keyVersion: after.keyVersion,
                rosterVersion: after.rosterVersion,
            };
        }, args);

        expect(result.statusCode).toEqual(0);
        expect(result.users).toEqual([users.u1.id]);
        // Removing them one at a time would have charged two epochs; a batch costs one.
        expect(result.keyVersion).toEqual(2);
        expect(result.rosterVersion).toEqual(2);
    });

    // =========================================================================
    // ENVELOPES (a group as a standalone encryption target)
    // =========================================================================

    test("Sealing and opening an envelope for a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi1 = await Endpoint.createGroupApi(conn1);
            const groupId = await groupApi1.createGroup(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("envelope_public"),
                enc.encode("envelope_private"),
            );
            const group = await groupApi1.getGroup(groupId);

            const sealed = await groupApi1.encrypt(groupId, enc.encode("from_a_member"));

            // Any other member opens it with nothing told alongside it.
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const groupApi2 = await Endpoint.createGroupApi(conn2);
            const fromMember = await groupApi2.decrypt(sealed);

            // u3 is not in the group: it seals with public information only.
            const conn3 = await Endpoint.connect(users.u3.privKey, solutionId, bridgeUrl);
            const groupApi3 = await Endpoint.createGroupApi(conn3);
            const sealedAnonymously = await groupApi3.encryptAnonymously(
                groupId,
                group.groupPubKey,
                enc.encode("from_an_outsider"),
            );
            const anonymous = await groupApi2.decrypt(sealedAnonymously);

            // The outsider cannot read back what it sealed - only the group can.
            let outsiderCanRead = true;
            try {
                await groupApi3.decrypt(sealedAnonymously);
            } catch {
                outsiderCanRead = false;
            }

            return {
                fromMember: {
                    data: dec.decode(fromMember.data),
                    groupId: fromMember.groupId,
                    authorPubKey: fromMember.authorPubKey,
                    type: fromMember.type,
                },
                anonymous: {
                    data: dec.decode(anonymous.data),
                    groupId: anonymous.groupId,
                    authorPubKey: anonymous.authorPubKey,
                    type: anonymous.type,
                },
                u1PubKey: users.u1.pubKey,
                outsiderCanRead,
            };
        }, args);

        // ENVELOPE_FROM_MEMBER: the signature verified, so the author is who it says.
        expect(result.fromMember.data).toEqual("from_a_member");
        expect(result.fromMember.type).toEqual(1);
        expect(result.fromMember.authorPubKey).toEqual(result.u1PubKey);

        // ENVELOPE_ANONYMOUS: a throwaway keypair attests to nothing.
        expect(result.anonymous.data).toEqual("from_an_outsider");
        expect(result.anonymous.type).toEqual(2);
        expect(result.anonymous.authorPubKey).toEqual("");
        expect(result.anonymous.groupId).toEqual(result.fromMember.groupId);
        expect(result.outsiderCanRead).toBe(false);
    });

    test("Sealing and opening a file for a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const concat = (parts: Uint8Array[]) => {
                const total = parts.reduce((n, p) => n + p.length, 0);
                const out = new Uint8Array(total);
                let at = 0;
                for (const part of parts) {
                    out.set(part, at);
                    at += part.length;
                }
                return out;
            };
            const same = (a: Uint8Array, b: Uint8Array) =>
                a.length === b.length && a.every((byte, i) => byte === b[i]);

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi1 = await Endpoint.createGroupApi(conn1);
            const groupId = await groupApi1.createGroup(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("file_public"),
                enc.encode("file_private"),
            );

            // Big enough to span several internal chunks, and not a repeating byte,
            // so a misplaced chunk cannot pass unnoticed.
            const plaintext = new Uint8Array(300_000);
            for (let i = 0; i < plaintext.length; ++i) plaintext[i] = i % 251;
            const BLOCK = 1 << 16;

            // ---- seal: nothing is read or written for us, we drive it ----------
            const writeHandle = await groupApi1.beginFileEncryption(groupId, plaintext.length);
            const cipherParts: Uint8Array[] = [];
            for (let at = 0; at < plaintext.length; at += BLOCK) {
                // May come back empty when the block did not finish a chunk.
                cipherParts.push(
                    await groupApi1.encryptFileChunk(
                        writeHandle,
                        plaintext.subarray(at, at + BLOCK),
                    ),
                );
            }
            const envelope = await groupApi1.finishFileEncryption(writeHandle);
            const cipher = concat(cipherParts);

            // ---- open it as another member, start to finish -------------------
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const groupApi2 = await Endpoint.createGroupApi(conn2);
            const readHandle = await groupApi2.beginFileDecryption(envelope);
            const plainParts: Uint8Array[] = [];
            for (let at = 0; at < cipher.length; at += BLOCK) {
                plainParts.push(
                    await groupApi2.decryptFileChunk(readHandle, cipher.subarray(at, at + BLOCK)),
                );
            }
            const info = await groupApi2.finishFileDecryption(readHandle);
            const whole = concat(plainParts);

            // ---- and read one range out of the middle of it -------------------
            const from = 100_000;
            const length = 1_000;
            const seekHandle = await groupApi2.beginFileDecryption(envelope);
            let at = await groupApi2.seekInEncryptedFile(seekHandle, from);
            const rangeParts: Uint8Array[] = [];
            let got = 0;
            while (got < length && at < cipher.length) {
                const block = cipher.subarray(at, at + BLOCK);
                at += block.length;
                const plain = await groupApi2.decryptFileChunk(seekHandle, block);
                rangeParts.push(plain);
                got += plain.length;
            }
            const rangeInfo = await groupApi2.finishFileDecryption(seekHandle);
            // The front is exact; the tail may overshoot, so trim it ourselves.
            const ranged = concat(rangeParts).subarray(0, length);

            return {
                cipherIsNotPlaintext: !same(cipher.subarray(0, 64), plaintext.subarray(0, 64)),
                wholeMatches: same(whole, plaintext),
                info: {
                    groupId: info.groupId,
                    authorPubKey: info.authorPubKey,
                    type: info.type,
                    complete: info.complete,
                },
                rangeMatches: same(ranged, plaintext.subarray(from, from + length)),
                rangeComplete: rangeInfo.complete,
                groupId,
                u1PubKey: users.u1.pubKey,
            };
        }, args);

        expect(result.cipherIsNotPlaintext).toBe(true);
        expect(result.wholeMatches).toBe(true);
        expect(result.info.groupId).toEqual(result.groupId);
        expect(result.info.type).toEqual(1);
        expect(result.info.authorPubKey).toEqual(result.u1PubKey);
        // A straight read start to finish: every chunk the signed size called for arrived.
        expect(result.info.complete).toBe(true);

        expect(result.rangeMatches).toBe(true);
        // Seeking gives up the truncation guarantee, and says so.
        expect(result.rangeComplete).toBe(false);
    });

    test("Custom notifications reach a group's members", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            GroupEventSelectorType,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, GroupEventSelectorType }) => {
                const Endpoint = window.Endpoint;
                const enc = new TextEncoder();
                const dec = new TextDecoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
                const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

                const eventQueue = await Endpoint.getEventQueue();

                const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi1 = await Endpoint.createGroupApi(conn1);
                const groupId = await groupApi1.createGroup(
                    contextId,
                    [u1Obj, u2Obj],
                    [u1Obj],
                    enc.encode("notify_public"),
                    enc.encode("notify_private"),
                );

                const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
                const groupApi2 = await Endpoint.createGroupApi(conn2);
                const query = await groupApi2.buildCustomEventSubscriptionQuery(
                    "typing",
                    GroupEventSelectorType.GROUP_ID,
                    groupId,
                );
                const subscriptionIds = await groupApi2.subscribeFor([query]);

                await groupApi1.sendCustomEvent(groupId, "typing", enc.encode("u1_is_typing"));

                // The queue also carries this test's libConnected events.
                let event: any;
                for (let i = 0; i < 10; ++i) {
                    const next = await eventQueue.waitEvent();
                    if (next.type === "groupCustom") {
                        event = next;
                        break;
                    }
                }
                await groupApi2.unsubscribeFrom(subscriptionIds);

                const data = event?.data as any;
                return {
                    groupId,
                    type: event?.type,
                    data: data && {
                        groupId: data.groupId,
                        channelName: data.channelName,
                        userId: data.userId,
                        authorPubKey: data.authorPubKey,
                        payload: dec.decode(data.payload),
                        statusCode: data.statusCode,
                    },
                    u1Id: users.u1.id,
                    u1PubKey: users.u1.pubKey,
                };
            },
            args,
        );

        expect(result.type).toEqual("groupCustom");
        expect(result.data.statusCode).toEqual(0);
        expect(result.data.groupId).toEqual(result.groupId);
        expect(result.data.channelName).toEqual("typing");
        // Opened with the key the recipient already holds, sender's signature verified.
        expect(result.data.payload).toEqual("u1_is_typing");
        expect(result.data.userId).toEqual(result.u1Id);
        expect(result.data.authorPubKey).toEqual(result.u1PubKey);
    });
});
