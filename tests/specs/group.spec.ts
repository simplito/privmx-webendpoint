import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { ContainerPolicy, SortOrder } from "../../src/Types";
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

            const groupId = await groupApi.createGroupWithKeyTree(
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
        expect(result.group.version).toEqual(1);
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
                groupApi.createGroupWithKeyTree("invalid_id", [u1Obj], [u1Obj], pub, priv),
            );
            // User pubKey does not match the userId
            await expectError(() =>
                groupApi.createGroupWithKeyTree(contextId, [mismatched], [u1Obj], pub, priv),
            );
            // Manager pubKey does not match the userId
            await expectError(() =>
                groupApi.createGroupWithKeyTree(contextId, [u1Obj], [mismatched], pub, priv),
            );
            // No managers
            await expectError(() =>
                groupApi.createGroupWithKeyTree(contextId, [u1Obj], [], pub, priv),
            );
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

            const g1 = await groupApi.createGroupWithKeyTree(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p1"),
                enc.encode("p1"),
            );
            const g2 = await groupApi.createGroupWithKeyTree(
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

            const groupId = await groupApi.createGroupWithKeyTree(
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
            await expectError(() =>
                groupApi.updateGroup(
                    contextId,
                    enc.encode("x"),
                    enc.encode("x"),
                    1,
                    false,
                    false,
                ),
            );
            // Stale version without force
            await expectError(() =>
                groupApi.updateGroup(
                    groupId,
                    enc.encode("x"),
                    enc.encode("x"),
                    99,
                    false,
                    false,
                ),
            );

            await groupApi.updateGroup(
                groupId,
                enc.encode("v2"),
                enc.encode("v2_priv"),
                1,
                false,
                false,
            );
            const updated = await groupApi.getGroup(groupId);

            // force skips the version check
            await groupApi.updateGroup(
                groupId,
                enc.encode("v3"),
                enc.encode("v3_priv"),
                99,
                true,
                false,
            );
            const forced = await groupApi.getGroup(groupId);

            return {
                updated: {
                    version: updated.version,
                    statusCode: updated.statusCode,
                    publicMeta: dec.decode(updated.publicMeta),
                    privateMeta: dec.decode(updated.privateMeta),
                    users: updated.users,
                    managers: updated.managers,
                },
                forced: {
                    version: forced.version,
                    statusCode: forced.statusCode,
                    publicMeta: dec.decode(forced.publicMeta),
                },
            };
        }, args);

        expect(result.updated.statusCode).toEqual(0);
        expect(result.updated.version).toEqual(2);
        expect(result.updated.publicMeta).toEqual("v2");
        expect(result.updated.privateMeta).toEqual("v2_priv");
        // updateGroup is metadata only - the roster is untouched.
        expect(result.updated.users).toEqual([users.u1.id]);
        expect(result.updated.managers).toEqual([users.u1.id]);

        expect(result.forced.statusCode).toEqual(0);
        expect(result.forced.version).toEqual(3);
        expect(result.forced.publicMeta).toEqual("v3");
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

            const groupId = await groupApi.createGroupWithKeyTree(
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
            const groupId = await groupApi1.createGroupWithKeyTree(
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
            const groupId = await groupApi1.createGroupWithKeyTree(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("roster_public"),
                enc.encode("roster_private"),
            );
            const before = await groupApi1.getGroup(groupId);

            await groupApi1.addGroupMember(
                groupId,
                u3Obj,
                false, // asManager
                [u1Obj, u2Obj, u3Obj], // roster after the addition
                [u1Obj],
                before.publicMeta,
                before.privateMeta,
            );
            const after = await groupApi1.getGroup(groupId);

            // The newcomer can now read the group.
            const conn3 = await Endpoint.connect(users.u3.privKey, solutionId, bridgeUrl);
            const groupApi3 = await Endpoint.createGroupApi(conn3);
            const asNewMember = await groupApi3.getGroup(groupId);

            return {
                beforeKeyVersion: before.keyVersion,
                after: { users: after.users, managers: after.managers, keyVersion: after.keyVersion },
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
        expect(result.newMember.statusCode).toEqual(0);
        expect(result.newMember.privateMeta).toEqual("roster_private");
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
            const groupId = await groupApi.createGroupWithKeyTree(
                contextId,
                [u1Obj, u2Obj, u3Obj],
                [u1Obj],
                enc.encode("rotating_public"),
                enc.encode("rotating_private"),
            );
            const before = await groupApi.getGroup(groupId);

            await groupApi.removeGroupMember(
                groupId,
                users.u3.id,
                [u1Obj, u2Obj], // roster that remains
                [u1Obj],
                before.publicMeta,
                before.privateMeta,
            );
            const after = await groupApi.getGroup(groupId);

            return {
                beforeKeyVersion: before.keyVersion,
                after: {
                    statusCode: after.statusCode,
                    users: after.users,
                    keyVersion: after.keyVersion,
                },
            };
        }, args);

        expect(result.beforeKeyVersion).toEqual(1);
        expect(result.after.statusCode).toEqual(0);
        expect(result.after.users).toHaveLength(2);
        expect(result.after.users).not.toContain(users.u3.id);
        // A removal replaces the path to the root and mints a new epoch key.
        expect(result.after.keyVersion).toEqual(2);
    });
});

test.describe("ContainersUsingGroupsTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    test("Thread carries its group grants, and none when created without", async ({
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

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi = await Endpoint.createGroupApi(connection);
            const threadApi = await Endpoint.createThreadApi(connection);

            const mkGroup = async (meta: string) => {
                const id = await groupApi.createGroupWithKeyTree(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode(meta),
                    enc.encode(meta),
                );
                return groupApi.getGroup(id);
            };
            const gA = await mkGroup("gA");
            const gB = await mkGroup("gB");

            const granted = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("granted_public"),
                enc.encode("granted_private"),
                undefined,
                [
                    {
                        groupId: gA.groupId,
                        role: "user",
                        groupPubKey: gA.groupPubKey,
                        groupEpoch: gA.keyVersion,
                    },
                    {
                        groupId: gB.groupId,
                        role: "manager",
                        groupPubKey: gB.groupPubKey,
                        groupEpoch: gB.keyVersion,
                    },
                ],
            );
            const plain = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("plain_public"),
                enc.encode("plain_private"),
            );

            const grantedThread = await threadApi.getThread(granted);
            const plainThread = await threadApi.getThread(plain);
            const listed = await threadApi.listThreads(contextId, {
                skip: 0,
                limit: 100,
                sortOrder: "desc",
            });

            return {
                gA: gA.groupId,
                gB: gB.groupId,
                granted: {
                    statusCode: grantedThread.statusCode,
                    groups: grantedThread.groups,
                    staleGroups: grantedThread.staleGroups,
                },
                plain: { groups: plainThread.groups, staleGroups: plainThread.staleGroups },
                listedGranted: listed.readItems.find((t) => t.threadId === granted)?.groups,
            };
        }, args);

        expect(result.granted.statusCode).toEqual(0);
        expect(result.granted.groups).toHaveLength(2);
        expect(result.granted.groups).toEqual(
            expect.arrayContaining([
                { groupId: result.gA, role: "user" },
                { groupId: result.gB, role: "manager" },
            ]),
        );
        // Freshly granted at the group's current epoch - nothing to re-key yet.
        expect(result.granted.staleGroups).toEqual([]);
        expect(result.plain.groups).toEqual([]);
        expect(result.plain.staleGroups).toEqual([]);
        // The grants survive a listing too.
        expect(result.listedGranted).toHaveLength(2);
    });

    test("Group member reads and writes a thread through the grant alone", async ({
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

            // user_1 owns the thread; user_2 only ever appears inside the group.
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi1 = await Endpoint.createGroupApi(conn1);
            const threadApi1 = await Endpoint.createThreadApi(conn1);

            const groupId = await groupApi1.createGroupWithKeyTree(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("g_pub"),
                enc.encode("g_priv"),
            );
            const group = await groupApi1.getGroup(groupId);

            const threadId = await threadApi1.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("thread_public"),
                enc.encode("thread_private"),
                undefined,
                [
                    {
                        groupId: group.groupId,
                        role: "user",
                        groupPubKey: group.groupPubKey,
                        groupEpoch: group.keyVersion,
                    },
                ],
            );
            const ownerMessageId = await threadApi1.sendMessage(
                threadId,
                enc.encode("m_pub"),
                enc.encode("m_priv"),
                enc.encode("owner_data"),
            );

            // user_2 holds no direct key entry on the thread.
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const threadApi2 = await Endpoint.createThreadApi(conn2);

            const thread = await threadApi2.getThread(threadId);
            const ownerMessage = await threadApi2.getMessage(ownerMessageId);
            // item.create is "user", and a grant splices the grantee into `users`.
            const granteeMessageId = await threadApi2.sendMessage(
                threadId,
                enc.encode("m_pub"),
                enc.encode("m_priv"),
                enc.encode("grantee_data"),
            );
            const listed = await threadApi2.listMessages(threadId, {
                skip: 0,
                limit: 10,
                sortOrder: "desc",
            });

            let updateRejected = false;
            try {
                // `update` is a manager operation and a "user" grant never reaches `managers`.
                await threadApi2.updateThread(
                    threadId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("denied_public"),
                    enc.encode("denied_private"),
                    thread.version,
                    false,
                    false,
                    undefined,
                    [
                        {
                            groupId: group.groupId,
                            role: "user",
                            groupPubKey: group.groupPubKey,
                            groupEpoch: group.keyVersion,
                        },
                    ],
                );
            } catch {
                updateRejected = true;
            }

            const granteeMessage = await threadApi1.getMessage(granteeMessageId);
            return {
                threadStatusCode: thread.statusCode,
                threadPrivateMeta: dec.decode(thread.privateMeta),
                ownerMessage: {
                    statusCode: ownerMessage.statusCode,
                    data: dec.decode(ownerMessage.data),
                },
                granteeMessage: {
                    statusCode: granteeMessage.statusCode,
                    data: dec.decode(granteeMessage.data),
                    author: granteeMessage.info.author,
                },
                listedStatusCodes: listed.readItems.map((m) => m.statusCode),
                updateRejected,
            };
        }, args);

        expect(result.threadStatusCode).toEqual(0);
        expect(result.threadPrivateMeta).toEqual("thread_private");
        expect(result.ownerMessage.statusCode).toEqual(0);
        expect(result.ownerMessage.data).toEqual("owner_data");
        expect(result.granteeMessage.statusCode).toEqual(0);
        expect(result.granteeMessage.data).toEqual("grantee_data");
        expect(result.granteeMessage.author).toEqual(users.u2.id);
        expect(result.listedStatusCodes).toEqual([0, 0]);
        expect(result.updateRejected).toBe(true);
    });

    test("User added to a granted group gains access to existing messages", async ({
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
            const u3Obj = { userId: users.u3.id, pubKey: users.u3.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi1 = await Endpoint.createGroupApi(conn1);
            const threadApi1 = await Endpoint.createThreadApi(conn1);

            const groupId = await groupApi1.createGroupWithKeyTree(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("late_pub"),
                enc.encode("late_priv"),
            );
            const group = await groupApi1.getGroup(groupId);

            // "all" on get/item.get lets a non-member download the ciphertext, so the
            // before/after difference is decryption and not visibility. Every `item`
            // entry has to be spelled out - unlike the container-level ones, the native
            // side rejects a partial ItemPolicy.
            const readAllPolicy = {
                get: "all",
                item: {
                    get: "all",
                    listMy: "all",
                    listAll: "all",
                    create: "user",
                    update: "user",
                    delete_: "user",
                },
            } as ContainerPolicy;

            const threadId = await threadApi1.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("late_thread_public"),
                enc.encode("late_thread_private"),
                readAllPolicy,
                [
                    {
                        groupId: group.groupId,
                        role: "user",
                        groupPubKey: group.groupPubKey,
                        groupEpoch: group.keyVersion,
                    },
                ],
            );
            const messageId = await threadApi1.sendMessage(
                threadId,
                enc.encode("m_pub"),
                enc.encode("m_priv"),
                enc.encode("late_data"),
            );

            // user_3 is not in the group yet - it downloads but cannot decrypt.
            const conn3 = await Endpoint.connect(users.u3.privKey, solutionId, bridgeUrl);
            const threadApi3 = await Endpoint.createThreadApi(conn3);
            const threadBefore = await threadApi3.getThread(threadId);
            const messageBefore = await threadApi3.getMessage(messageId);
            // One authorized socket per user: drop this one before reconnecting below.
            await conn3.disconnect();

            // Seat user_3's leaf in the key tree (updateGroup could not do this).
            await groupApi1.addGroupMember(
                groupId,
                u3Obj,
                false,
                [u1Obj, u2Obj, u3Obj],
                [u1Obj],
                group.publicMeta,
                group.privateMeta,
            );

            // Reconnect as user_3 so nothing is served from the first session's caches.
            const conn3b = await Endpoint.connect(users.u3.privKey, solutionId, bridgeUrl);
            const threadApi3b = await Endpoint.createThreadApi(conn3b);
            const threadAfter = await threadApi3b.getThread(threadId);
            const messageAfter = await threadApi3b.getMessage(messageId);

            return {
                beforeThreadStatus: threadBefore.statusCode,
                beforeMessageStatus: messageBefore.statusCode,
                afterThreadStatus: threadAfter.statusCode,
                afterMessage: {
                    statusCode: messageAfter.statusCode,
                    data: dec.decode(messageAfter.data),
                },
            };
        }, args);

        expect(result.beforeThreadStatus).not.toEqual(0);
        expect(result.beforeMessageStatus).not.toEqual(0);
        expect(result.afterThreadStatus).toEqual(0);
        expect(result.afterMessage.statusCode).toEqual(0);
        expect(result.afterMessage.data).toEqual("late_data");
    });

    test("Removing a group member makes the thread stale until its keys are rotated", async ({
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
            const u3Obj = { userId: users.u3.id, pubKey: users.u3.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi1 = await Endpoint.createGroupApi(conn1);
            const threadApi1 = await Endpoint.createThreadApi(conn1);

            const groupId = await groupApi1.createGroupWithKeyTree(
                contextId,
                [u1Obj, u2Obj, u3Obj],
                [u1Obj],
                enc.encode("stale_pub"),
                enc.encode("stale_priv"),
            );
            const group = await groupApi1.getGroup(groupId);

            const threadId = await threadApi1.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("stale_thread_public"),
                enc.encode("stale_thread_private"),
                undefined,
                [
                    {
                        groupId: group.groupId,
                        role: "user",
                        groupPubKey: group.groupPubKey,
                        groupEpoch: group.keyVersion,
                    },
                ],
            );

            // The removal advances the group's epoch past the one the thread key is wrapped to.
            await groupApi1.removeGroupMember(
                groupId,
                users.u3.id,
                [u1Obj, u2Obj],
                [u1Obj],
                group.publicMeta,
                group.privateMeta,
            );
            const stale = await threadApi1.getThread(threadId);

            // No `groups` argument: the current epoch and key are read from the group itself.
            await threadApi1.rotateThreadKeys(
                threadId,
                [u1Obj],
                [u1Obj],
                stale.version,
                false,
            );
            const rekeyed = await threadApi1.getThread(threadId);

            const messageId = await threadApi1.sendMessage(
                threadId,
                enc.encode("m_pub"),
                enc.encode("m_priv"),
                enc.encode("post_rekey_data"),
            );

            // user_2 is still in the group at its new epoch, and holds no direct key entry.
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const threadApi2 = await Endpoint.createThreadApi(conn2);
            const message = await threadApi2.getMessage(messageId);

            return {
                groupId,
                staleStatus: stale.statusCode,
                staleGroups: stale.staleGroups,
                rekeyed: { statusCode: rekeyed.statusCode, staleGroups: rekeyed.staleGroups },
                message: { statusCode: message.statusCode, data: dec.decode(message.data) },
            };
        }, args);

        expect(result.staleStatus).toEqual(0);
        expect(result.staleGroups).toEqual([result.groupId]);
        expect(result.rekeyed.statusCode).toEqual(0);
        expect(result.rekeyed.staleGroups).toEqual([]);
        expect(result.message.statusCode).toEqual(0);
        expect(result.message.data).toEqual("post_rekey_data");
    });

    test("updateThread adds and removes a group grant", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);

            const groupId = await groupApi.createGroupWithKeyTree(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("g_pub"),
                enc.encode("g_priv"),
            );
            const group = await groupApi.getGroup(groupId);
            const grant = (role: string) => ({
                groupId: group.groupId,
                role,
                groupPubKey: group.groupPubKey,
                groupEpoch: group.keyVersion,
            });

            const threadId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("t_pub"),
                enc.encode("t_priv"),
            );
            const created = await threadApi.getThread(threadId);

            const update = async (version: number, groups: any[]) =>
                threadApi.updateThread(
                    threadId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("t_pub"),
                    enc.encode("t_priv"),
                    version,
                    false,
                    false,
                    undefined,
                    groups,
                );

            await update(created.version, [grant("user")]);
            const added = await threadApi.getThread(threadId);

            await update(added.version, [grant("manager")]);
            const promoted = await threadApi.getThread(threadId);

            await update(promoted.version, []);
            const removed = await threadApi.getThread(threadId);

            return {
                groupId,
                created: created.groups,
                added: added.groups,
                promoted: promoted.groups,
                removed: removed.groups,
            };
        }, args);

        expect(result.created).toEqual([]);
        expect(result.added).toEqual([{ groupId: result.groupId, role: "user" }]);
        expect(result.promoted).toEqual([{ groupId: result.groupId, role: "manager" }]);
        expect(result.removed).toEqual([]);
    });

    test("Store, KVDB and Inbox accept group grants", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const inboxApi = await Endpoint.createInboxApi(connection);

            const groupId = await groupApi.createGroupWithKeyTree(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("g_pub"),
                enc.encode("g_priv"),
            );
            const group = await groupApi.getGroup(groupId);
            const grants = [
                {
                    groupId: group.groupId,
                    role: "user",
                    groupPubKey: group.groupPubKey,
                    groupEpoch: group.keyVersion,
                },
            ];

            const storeId = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("s_pub"),
                enc.encode("s_priv"),
                undefined,
                grants,
            );
            const kvdbId = await kvdbApi.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("k_pub"),
                enc.encode("k_priv"),
                undefined,
                grants,
            );
            const inboxId = await inboxApi.createInbox(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("i_pub"),
                enc.encode("i_priv"),
                undefined,
                undefined,
                grants,
            );

            const store = await storeApi.getStore(storeId);
            const kvdb = await kvdbApi.getKvdb(kvdbId);
            const inbox = await inboxApi.getInbox(inboxId);

            return {
                groupId,
                store: { statusCode: store.statusCode, groups: store.groups },
                kvdb: { statusCode: kvdb.statusCode, groups: kvdb.groups },
                inbox: { statusCode: inbox.statusCode, groups: inbox.groups },
            };
        }, args);

        const expectedGrant = [{ groupId: result.groupId, role: "user" }];
        expect(result.store.statusCode).toEqual(0);
        expect(result.store.groups).toEqual(expectedGrant);
        expect(result.kvdb.statusCode).toEqual(0);
        expect(result.kvdb.groups).toEqual(expectedGrant);
        expect(result.inbox.statusCode).toEqual(0);
        expect(result.inbox.groups).toEqual(expectedGrant);
    });
});
