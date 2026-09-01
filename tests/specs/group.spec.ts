import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { SortOrder } from "../../src/Types";
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
            await expectError(() =>
                groupApi.updateGroup(contextId, enc.encode("x"), enc.encode("x"), 1, false, false),
            );
            // Stale version without force
            await expectError(() =>
                groupApi.updateGroup(groupId, enc.encode("x"), enc.encode("x"), 99, false, false),
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
                after: {
                    users: after.users,
                    managers: after.managers,
                    keyVersion: after.keyVersion,
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
            const groupId = await groupApi.createGroup(
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
