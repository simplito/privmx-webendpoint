import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { setupUsers } from "../test-utils";
import { installGroupKit } from "../groupKit";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

// Port of the endpoint's own KvdbUsingGroupsTest.cpp - how KvdbApi behaves when
// a KVDB's access comes from a group grant rather than its own roster. See
// threadUsingGroups.spec.ts for the three ways this harness differs from the
// C++ fixture (minted groups, concurrent sockets, `groupEpoch: 0`).
//
// `setEntry` with `version: 0` means "this key must not exist yet", which is how
// every seeded entry below is written.
test.describe("KvdbUsingGroupsTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
        await installGroupKit(page);
    });

    const argsFor = (backend: { bridgeUrl: string }, users: any) => ({
        bridgeUrl: backend.bridgeUrl,
        solutionId: testData.solutionId,
        contextId: testData.contextId,
        users,
    });

    // =========================================================================
    // GRANTS ON THE CONTAINER
    // =========================================================================

    test("createKvdb with group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const kvdbApi = await window.Endpoint.createKvdbApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const kvdbId = await kvdbApi.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("public_meta"),
                    gk.enc("private_meta"),
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const kvdb = await kvdbApi.getKvdb(kvdbId);

                return {
                    groupId: group1.groupId,
                    groupStatusCode: group1.statusCode,
                    groupPubKey: group1.groupPubKey,
                    kvdbId,
                    statusCode: kvdb.statusCode,
                    publicMeta: gk.dec(kvdb.publicMeta),
                    groups: kvdb.groups,
                };
            },
            argsFor(backend, users),
        );

        expect(result.groupStatusCode).toEqual(0);
        expect(result.groupPubKey).not.toEqual("");
        expect(result.kvdbId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.publicMeta).toEqual("public_meta");
        expect(result.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
    });

    test("createKvdb with multiple group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const kvdbApi = await window.Endpoint.createKvdbApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const group2 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const kvdbId = await kvdbApi.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("two_groups_public"),
                    gk.enc("two_groups_private"),
                    undefined,
                    [gk.grant(group1, "user"), gk.grant(group2, "manager")],
                );
                const kvdb = await kvdbApi.getKvdb(kvdbId);

                return {
                    group1: group1.groupId,
                    group2: group2.groupId,
                    statusCode: kvdb.statusCode,
                    groups: kvdb.groups,
                };
            },
            argsFor(backend, users),
        );

        expect(result.statusCode).toEqual(0);
        expect(result.groups).toHaveLength(2);
        expect(result.groups).toEqual(
            expect.arrayContaining([
                { groupId: result.group1, role: "user" },
                { groupId: result.group2, role: "manager" },
            ]),
        );
    });

    test("createKvdb without groups has an empty groups field", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const kvdbApi = await window.Endpoint.createKvdbApi(conn);
                const u1 = gk.u(users.u1);

                const kvdbId = await kvdbApi.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("no_groups_public"),
                    gk.enc("no_groups_private"),
                );
                const kvdb = await kvdbApi.getKvdb(kvdbId);
                return { kvdbId, statusCode: kvdb.statusCode, groups: kvdb.groups };
            },
            argsFor(backend, users),
        );

        expect(result.kvdbId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.groups).toEqual([]);
    });

    test("updateKvdb adds a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const kvdbApi = await window.Endpoint.createKvdbApi(conn);
                const u1 = gk.u(users.u1);

                const kvdbId = await kvdbApi.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("before_group"),
                    gk.enc("before_group_private"),
                );
                const created = await kvdbApi.getKvdb(kvdbId);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                await kvdbApi.updateKvdb(
                    kvdbId,
                    [u1],
                    [u1],
                    gk.enc("after_group"),
                    gk.enc("after_group_private"),
                    created.version,
                    false,
                    false,
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const updated = await kvdbApi.getKvdb(kvdbId);

                return {
                    groupId: group1.groupId,
                    createdGroups: created.groups,
                    statusCode: updated.statusCode,
                    publicMeta: gk.dec(updated.publicMeta),
                    groups: updated.groups,
                };
            },
            argsFor(backend, users),
        );

        expect(result.createdGroups).toEqual([]);
        expect(result.statusCode).toEqual(0);
        expect(result.publicMeta).toEqual("after_group");
        expect(result.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
    });

    test("updateKvdb removes a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const kvdbApi1 = await window.Endpoint.createKvdbApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const kvdbId = await kvdbApi1.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("with_group"),
                    gk.enc("with_group_private"),
                    gk.readAllContainerPolicy(),
                    [gk.grant(group2, "user")],
                );
                const created = await kvdbApi1.getKvdb(kvdbId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi2 = await window.Endpoint.createKvdbApi(conn2);
                const beforeRemoval = await kvdbApi2.getKvdb(kvdbId);
                await conn2.disconnect();

                await kvdbApi1.updateKvdb(
                    kvdbId,
                    [u1],
                    [u1],
                    gk.enc("no_group_now"),
                    gk.enc("no_group_private"),
                    created.version,
                    false,
                    false,
                    undefined,
                    [],
                );
                const updated = await kvdbApi1.getKvdb(kvdbId);

                const conn2b = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi2b = await window.Endpoint.createKvdbApi(conn2b);
                const afterRemoval = await kvdbApi2b.getKvdb(kvdbId);

                return {
                    createdGroups: created.groups,
                    before: {
                        statusCode: beforeRemoval.statusCode,
                        privateMeta: gk.dec(beforeRemoval.privateMeta),
                    },
                    updated: {
                        statusCode: updated.statusCode,
                        publicMeta: gk.dec(updated.publicMeta),
                        groups: updated.groups,
                    },
                    after: {
                        statusCode: afterRemoval.statusCode,
                        privateMeta: gk.dec(afterRemoval.privateMeta),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.createdGroups).toHaveLength(1);
        expect(result.before.statusCode).toEqual(0);
        expect(result.before.privateMeta).toEqual("with_group_private");
        expect(result.updated.statusCode).toEqual(0);
        expect(result.updated.publicMeta).toEqual("no_group_now");
        expect(result.updated.groups).toEqual([]);
        expect(result.after.statusCode).not.toEqual(0);
        expect(result.after.privateMeta).toEqual("");
    });

    test("updateKvdb changes a group's role", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const kvdbApi = await window.Endpoint.createKvdbApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const kvdbId = await kvdbApi.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("role_change"),
                    gk.enc("role_change_private"),
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const created = await kvdbApi.getKvdb(kvdbId);

                await kvdbApi.updateKvdb(
                    kvdbId,
                    [u1],
                    [u1],
                    gk.enc("role_change"),
                    gk.enc("role_change_private"),
                    created.version,
                    false,
                    false,
                    undefined,
                    [gk.grant(group1, "manager")],
                );
                const promoted = await kvdbApi.getKvdb(kvdbId);

                return {
                    groupId: group1.groupId,
                    created: created.groups,
                    promoted: promoted.groups,
                };
            },
            argsFor(backend, users),
        );

        expect(result.created).toEqual([{ groupId: result.groupId, role: "user" }]);
        expect(result.promoted).toEqual([{ groupId: result.groupId, role: "manager" }]);
    });

    test("listKvdbs includes the groups field", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const kvdbApi = await window.Endpoint.createKvdbApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const kvdbId = await kvdbApi.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("listed_with_group"),
                    gk.enc("listed_with_group_private"),
                    undefined,
                    [gk.grant(group1, "user")],
                );

                const list = await kvdbApi.listKvdbs(contextId, {
                    skip: 0,
                    limit: 100,
                    sortOrder: "desc",
                });
                const listed = list.readItems.find((k) => k.kvdbId === kvdbId);

                return {
                    groupId: group1.groupId,
                    found: listed !== undefined,
                    statusCode: listed?.statusCode,
                    groups: listed?.groups,
                };
            },
            argsFor(backend, users),
        );

        expect(result.found).toBe(true);
        expect(result.statusCode).toEqual(0);
        expect(result.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
    });

    test("createKvdb with an invalid group pubKey throws", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const kvdbApi = await window.Endpoint.createKvdbApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                await gk.expectError(() =>
                    kvdbApi.createKvdb(
                        contextId,
                        [u1],
                        [u1],
                        gk.enc("public"),
                        gk.enc("private"),
                        undefined,
                        [
                            {
                                groupId: group1.groupId,
                                role: "user",
                                groupPubKey: "not_a_valid_base58der_pubkey",
                                groupEpoch: 0,
                            },
                        ],
                    ),
                );
            },
            argsFor(backend, users),
        );
    });

    // =========================================================================
    // ENTRIES THROUGH THE GRANT
    // =========================================================================

    test("getEntry via a group grant", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const kvdbApi1 = await window.Endpoint.createKvdbApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const kvdbId = await kvdbApi1.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_kvdb_public"),
                    gk.enc("group_kvdb_private"),
                    undefined,
                    [gk.grant(group2, "user")],
                );
                await kvdbApi1.setEntry(
                    kvdbId,
                    "entry_key",
                    gk.enc("entry_public"),
                    gk.enc("entry_private"),
                    gk.enc("entry_data"),
                    0,
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi2 = await window.Endpoint.createKvdbApi(conn2);
                const entry = await kvdbApi2.getEntry(kvdbId, "entry_key");

                return {
                    statusCode: entry.statusCode,
                    privateMeta: gk.dec(entry.privateMeta),
                    data: gk.dec(entry.data),
                };
            },
            argsFor(backend, users),
        );

        expect(result.statusCode).toEqual(0);
        expect(result.privateMeta).toEqual("entry_private");
        expect(result.data).toEqual("entry_data");
    });

    test("listEntries via a group grant", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const kvdbApi1 = await window.Endpoint.createKvdbApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const kvdbId = await kvdbApi1.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_kvdb_public"),
                    gk.enc("group_kvdb_private"),
                    undefined,
                    [gk.grant(group2, "user")],
                );
                await kvdbApi1.setEntry(
                    kvdbId,
                    "key1",
                    gk.enc("pub1"),
                    gk.enc("priv1"),
                    gk.enc("data1"),
                    0,
                );
                await kvdbApi1.setEntry(
                    kvdbId,
                    "key2",
                    gk.enc("pub2"),
                    gk.enc("priv2"),
                    gk.enc("data2"),
                    0,
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi2 = await window.Endpoint.createKvdbApi(conn2);
                const list = await kvdbApi2.listEntries(kvdbId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });

                return {
                    totalAvailable: list.totalAvailable,
                    statusCodes: list.readItems.map((e) => e.statusCode),
                    privateMetas: list.readItems.map((e) => gk.dec(e.privateMeta)),
                    datas: list.readItems.map((e) => gk.dec(e.data)),
                };
            },
            argsFor(backend, users),
        );

        expect(result.totalAvailable).toEqual(2);
        expect(result.statusCodes).toEqual([0, 0]);
        expect(result.privateMetas).toEqual(expect.arrayContaining(["priv1", "priv2"]));
        expect(result.datas).toEqual(expect.arrayContaining(["data1", "data2"]));
    });

    test("entries are accessible by all group members", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const kvdbApi1 = await window.Endpoint.createKvdbApi(conn1);
                const u1 = gk.u(users.u1);

                const group3 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "group_3",
                );
                const kvdbId = await kvdbApi1.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_kvdb_public"),
                    gk.enc("group_kvdb_private"),
                    undefined,
                    [gk.grant(group3, "user")],
                );
                await kvdbApi1.setEntry(
                    kvdbId,
                    "shared_key",
                    gk.enc("shared_public"),
                    gk.enc("shared_private"),
                    gk.enc("shared_data"),
                    0,
                );

                const readAs = async (privKey: string) => {
                    const conn = await window.Endpoint.connect(privKey, solutionId, bridgeUrl);
                    const api = await window.Endpoint.createKvdbApi(conn);
                    const entry = await api.getEntry(kvdbId, "shared_key");
                    return {
                        statusCode: entry.statusCode,
                        privateMeta: gk.dec(entry.privateMeta),
                        data: gk.dec(entry.data),
                    };
                };

                return {
                    user2: await readAs(users.u2.privKey),
                    user3: await readAs(users.u3.privKey),
                };
            },
            argsFor(backend, users),
        );

        for (const seen of [result.user2, result.user3]) {
            expect(seen.statusCode).toEqual(0);
            expect(seen.privateMeta).toEqual("shared_private");
            expect(seen.data).toEqual("shared_data");
        }
    });

    test("getEntry survives the grant's removal for the key it was written under", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const kvdbApi1 = await window.Endpoint.createKvdbApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const kvdbId = await kvdbApi1.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_kvdb_public"),
                    gk.enc("group_kvdb_private"),
                    gk.readAllPolicy(),
                    [gk.grant(group2, "user")],
                );
                await kvdbApi1.setEntry(
                    kvdbId,
                    "old_key",
                    gk.enc("old_public"),
                    gk.enc("secret_private"),
                    gk.enc("secret_data"),
                    0,
                );
                const created = await kvdbApi1.getKvdb(kvdbId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi2 = await window.Endpoint.createKvdbApi(conn2);
                const beforeRemoval = await kvdbApi2.getEntry(kvdbId, "old_key");
                await conn2.disconnect();

                await kvdbApi1.updateKvdb(
                    kvdbId,
                    [u1],
                    [u1],
                    gk.enc("no_group"),
                    gk.enc("no_group_private"),
                    created.version,
                    false,
                    false,
                    undefined,
                    [],
                );
                await kvdbApi1.setEntry(
                    kvdbId,
                    "new_key",
                    gk.enc("new_public"),
                    gk.enc("new_private"),
                    gk.enc("new_data"),
                    0,
                );

                const conn2b = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi2b = await window.Endpoint.createKvdbApi(conn2b);
                const afterRemoval = await kvdbApi2b.getEntry(kvdbId, "old_key");
                const newEntry = await kvdbApi2b.getEntry(kvdbId, "new_key");

                return {
                    before: {
                        statusCode: beforeRemoval.statusCode,
                        privateMeta: gk.dec(beforeRemoval.privateMeta),
                    },
                    after: {
                        statusCode: afterRemoval.statusCode,
                        privateMeta: gk.dec(afterRemoval.privateMeta),
                    },
                    newEntry: {
                        statusCode: newEntry.statusCode,
                        privateMeta: gk.dec(newEntry.privateMeta),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.before.statusCode).toEqual(0);
        expect(result.before.privateMeta).toEqual("secret_private");
        // Historical group key entries stay resolvable for the key versions they covered.
        expect(result.after.statusCode).toEqual(0);
        expect(result.after.privateMeta).toEqual("secret_private");
        // The key minted by the revocation was never wrapped to the group.
        expect(result.newEntry.statusCode).not.toEqual(0);
        expect(result.newEntry.privateMeta).toEqual("");
    });

    test("a user added to a granted group gains access to the kvdb and its entries", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const kvdbApi1 = await window.Endpoint.createKvdbApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const kvdbId = await kvdbApi1.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_kvdb_public"),
                    gk.enc("group_kvdb_private"),
                    gk.readAllPolicy(),
                    [gk.grant(group2, "user")],
                );
                await kvdbApi1.setEntry(
                    kvdbId,
                    "entry_key",
                    gk.enc("entry_pub"),
                    gk.enc("entry_priv"),
                    gk.enc("entry_data"),
                    0,
                );

                const conn3 = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi3 = await window.Endpoint.createKvdbApi(conn3);
                const kvdbBefore = await kvdbApi3.getKvdb(kvdbId);
                const entryBefore = await kvdbApi3.getEntry(kvdbId, "entry_key");
                await conn3.disconnect();

                await groupApi1.addGroupMembers(group2.groupId, [
                    { user: gk.u(users.u3), role: "user" },
                ]);

                const conn3b = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi3b = await window.Endpoint.createKvdbApi(conn3b);
                const kvdbAfter = await kvdbApi3b.getKvdb(kvdbId);
                const entryAfter = await kvdbApi3b.getEntry(kvdbId, "entry_key");

                return {
                    beforeKvdb: kvdbBefore.statusCode,
                    beforeEntry: entryBefore.statusCode,
                    afterKvdb: kvdbAfter.statusCode,
                    afterEntry: {
                        statusCode: entryAfter.statusCode,
                        privateMeta: gk.dec(entryAfter.privateMeta),
                        data: gk.dec(entryAfter.data),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.beforeKvdb).not.toEqual(0);
        expect(result.beforeEntry).not.toEqual(0);
        expect(result.afterKvdb).toEqual(0);
        expect(result.afterEntry.statusCode).toEqual(0);
        expect(result.afterEntry.privateMeta).toEqual("entry_priv");
        expect(result.afterEntry.data).toEqual("entry_data");
    });

    // =========================================================================
    // WHICH KEY SERVES THE READ
    // =========================================================================

    test("a direct member of a granted group reads and updates", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const kvdbApi = await window.Endpoint.createKvdbApi(conn);
                const u1 = gk.u(users.u1);

                // Every keyId opens from `keys` and the group branch is skipped.
                // `updateKvdb` is the interesting half: `verifyKeysSecret` fails on
                // any non-zero status, so an unresolved group entry there is the
                // difference between an update and an exception.
                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const kvdbId = await kvdbApi.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_kvdb_public"),
                    gk.enc("group_kvdb_private"),
                    undefined,
                    gk.grants([group1]),
                );
                await kvdbApi.setEntry(
                    kvdbId,
                    "direct_key",
                    gk.enc("direct_public"),
                    gk.enc("direct_private"),
                    gk.enc("direct_data"),
                    0,
                );

                const kvdb = await kvdbApi.getKvdb(kvdbId);
                const entry = await kvdbApi.getEntry(kvdbId, "direct_key");
                const list = await kvdbApi.listEntries(kvdbId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });

                await kvdbApi.updateKvdb(
                    kvdbId,
                    [u1],
                    [u1],
                    gk.enc("direct_updated_public"),
                    gk.enc("direct_updated_private"),
                    kvdb.version,
                    false,
                    false,
                    undefined,
                    gk.grants([group1]),
                );
                const updated = await kvdbApi.getKvdb(kvdbId);

                return {
                    kvdb: { statusCode: kvdb.statusCode, groups: kvdb.groups.length },
                    entry: { statusCode: entry.statusCode, data: gk.dec(entry.data) },
                    list: {
                        totalAvailable: list.totalAvailable,
                        statusCodes: list.readItems.map((e) => e.statusCode),
                    },
                    updated: {
                        statusCode: updated.statusCode,
                        privateMeta: gk.dec(updated.privateMeta),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.kvdb.statusCode).toEqual(0);
        expect(result.kvdb.groups).toEqual(1);
        expect(result.entry.statusCode).toEqual(0);
        expect(result.entry.data).toEqual("direct_data");
        expect(result.list.totalAvailable).toEqual(1);
        expect(result.list.statusCodes).toEqual([0]);
        expect(result.updated.statusCode).toEqual(0);
        expect(result.updated.privateMeta).toEqual("direct_updated_private");
    });

    test("a caller in no granted group reads via its direct key", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const kvdbApi1 = await window.Endpoint.createKvdbApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                const group1 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const kvdbId = await kvdbApi1.createKvdb(
                    contextId,
                    [u1, u2],
                    [u1, u2],
                    gk.enc("group_kvdb_public"),
                    gk.enc("group_kvdb_private"),
                    undefined,
                    gk.grants([group1]),
                );
                await kvdbApi1.setEntry(
                    kvdbId,
                    "nogroup_key",
                    gk.enc("nogroup_public"),
                    gk.enc("nogroup_private"),
                    gk.enc("nogroup_data"),
                    0,
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi2 = await window.Endpoint.createKvdbApi(conn2);
                const kvdb = await kvdbApi2.getKvdb(kvdbId);
                const entry = await kvdbApi2.getEntry(kvdbId, "nogroup_key");

                return {
                    kvdb: { statusCode: kvdb.statusCode, groups: kvdb.groups.length },
                    entry: {
                        statusCode: entry.statusCode,
                        privateMeta: gk.dec(entry.privateMeta),
                        data: gk.dec(entry.data),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.kvdb.statusCode).toEqual(0);
        // `groups` stays unnarrowed, so user_2 still sees the grant it is not part of.
        expect(result.kvdb.groups).toEqual(1);
        expect(result.entry.statusCode).toEqual(0);
        expect(result.entry.privateMeta).toEqual("nogroup_private");
        expect(result.entry.data).toEqual("nogroup_data");
    });

    test("a caller in two granted groups reads", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const kvdbApi1 = await window.Endpoint.createKvdbApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const group3 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "group_3",
                );
                const kvdbId = await kvdbApi1.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_kvdb_public"),
                    gk.enc("group_kvdb_private"),
                    undefined,
                    gk.grants([group2, group3]),
                );
                await kvdbApi1.setEntry(
                    kvdbId,
                    "twogroups_key",
                    gk.enc("twogroups_public"),
                    gk.enc("twogroups_private"),
                    gk.enc("twogroups_data"),
                    0,
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi2 = await window.Endpoint.createKvdbApi(conn2);
                const kvdb = await kvdbApi2.getKvdb(kvdbId);
                const entry = await kvdbApi2.getEntry(kvdbId, "twogroups_key");

                return {
                    kvdb: { statusCode: kvdb.statusCode, groups: kvdb.groups.length },
                    entry: {
                        statusCode: entry.statusCode,
                        privateMeta: gk.dec(entry.privateMeta),
                        data: gk.dec(entry.data),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.kvdb.statusCode).toEqual(0);
        expect(result.kvdb.groups).toEqual(2);
        expect(result.entry.statusCode).toEqual(0);
        expect(result.entry.privateMeta).toEqual("twogroups_private");
        expect(result.entry.data).toEqual("twogroups_data");
    });

    // =========================================================================
    // RE-KEYING AND STALE EPOCHS
    // =========================================================================

    test("rotateKvdbKeys covers a grantee group the caller did not name", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const kvdbApi1 = await window.Endpoint.createKvdbApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                const granteeGroup = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const kvdbId = await kvdbApi1.createKvdb(
                    contextId,
                    [u1, u2],
                    [u1, u2],
                    gk.enc("group_kvdb_public"),
                    gk.enc("group_kvdb_private"),
                    undefined,
                    gk.grants([granteeGroup]),
                );
                const before = await kvdbApi1.getKvdb(kvdbId);

                // user_2 re-keys without naming any group at all.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi2 = await window.Endpoint.createKvdbApi(conn2);
                await kvdbApi2.rotateKvdbKeys(
                    kvdbId,
                    [u1, u2],
                    [u1, u2],
                    before.version,
                    false,
                    [],
                );

                const after = await kvdbApi1.getKvdb(kvdbId);
                await kvdbApi1.setEntry(
                    kvdbId,
                    "post_rekey_key",
                    gk.enc("post_rekey_pub"),
                    gk.enc("post_rekey_priv"),
                    gk.enc("post_rekey_data"),
                    0,
                );
                const entry = await kvdbApi1.getEntry(kvdbId, "post_rekey_key");

                return {
                    groupId: granteeGroup.groupId,
                    beforeStatusCode: before.statusCode,
                    after: { statusCode: after.statusCode, groups: after.groups },
                    entry: { statusCode: entry.statusCode, privateMeta: gk.dec(entry.privateMeta) },
                };
            },
            argsFor(backend, users),
        );

        expect(result.beforeStatusCode).toEqual(0);
        expect(result.after.statusCode).toEqual(0);
        expect(result.after.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
        expect(result.entry.statusCode).toEqual(0);
        expect(result.entry.privateMeta).toEqual("post_rekey_priv");
    });

    test("rotateKvdbKeys clears staleGroups after the group advances its epoch", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const kvdbApi1 = await window.Endpoint.createKvdbApi(conn1);
                const u1 = gk.u(users.u1);

                const group = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "grp",
                );
                const kvdbId = await kvdbApi1.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_kvdb_public"),
                    gk.enc("group_kvdb_private"),
                    undefined,
                    gk.grants([group]),
                );
                await kvdbApi1.setEntry(
                    kvdbId,
                    "old_epoch_key",
                    gk.enc("old_epoch_pub"),
                    gk.enc("old_epoch_priv"),
                    gk.enc("old_epoch_data"),
                    0,
                );

                await groupApi1.removeGroupMembers(group.groupId, [users.u3.id]);
                const rotatedGroup = await groupApi1.getGroup(group.groupId);
                const stale = await kvdbApi1.getKvdb(kvdbId);

                await kvdbApi1.rotateKvdbKeys(kvdbId, [u1], [u1], stale.version, false, []);
                const fresh = await kvdbApi1.getKvdb(kvdbId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi2 = await window.Endpoint.createKvdbApi(conn2);
                const oldEpochEntry = await kvdbApi2.getEntry(kvdbId, "old_epoch_key");

                return {
                    groupId: group.groupId,
                    groupKeyVersion: group.keyVersion,
                    rotatedKeyVersion: rotatedGroup.keyVersion,
                    stale: { statusCode: stale.statusCode, staleGroups: stale.staleGroups },
                    fresh: {
                        statusCode: fresh.statusCode,
                        staleGroups: fresh.staleGroups,
                        groups: fresh.groups.length,
                    },
                    oldEpochEntry: {
                        statusCode: oldEpochEntry.statusCode,
                        privateMeta: gk.dec(oldEpochEntry.privateMeta),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.groupKeyVersion).toEqual(1);
        expect(result.rotatedKeyVersion).toEqual(2);
        expect(result.stale.statusCode).toEqual(0);
        expect(result.stale.staleGroups).toEqual([result.groupId]);
        expect(result.fresh.statusCode).toEqual(0);
        expect(result.fresh.staleGroups).toEqual([]);
        expect(result.fresh.groups).toEqual(1);
        expect(result.oldEpochEntry.statusCode).toEqual(0);
        expect(result.oldEpochEntry.privateMeta).toEqual("old_epoch_priv");
    });

    test("setEntry auto-rotates a stale kvdb key", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const kvdbApi1 = await window.Endpoint.createKvdbApi(conn1);
                const u1 = gk.u(users.u1);

                // The same ground as the test above minus the rotateKvdbKeys call:
                // writing the entry re-keys the KVDB and writes under the new key.
                const group = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "auto_grp",
                );
                const kvdbId = await kvdbApi1.createKvdb(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_kvdb_public"),
                    gk.enc("group_kvdb_private"),
                    undefined,
                    gk.grants([group]),
                );
                await groupApi1.removeGroupMembers(group.groupId, [users.u3.id]);
                const stale = await kvdbApi1.getKvdb(kvdbId);

                await kvdbApi1.setEntry(
                    kvdbId,
                    "auto_key",
                    gk.enc("auto_pub"),
                    gk.enc("auto_priv"),
                    gk.enc("auto_data"),
                    0,
                );
                const rekeyed = await kvdbApi1.getKvdb(kvdbId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const kvdbApi2 = await window.Endpoint.createKvdbApi(conn2);
                const entry = await kvdbApi2.getEntry(kvdbId, "auto_key");

                return {
                    groupId: group.groupId,
                    stale: {
                        statusCode: stale.statusCode,
                        staleGroups: stale.staleGroups,
                        version: stale.version,
                        users: stale.users,
                        managers: stale.managers,
                    },
                    rekeyed: {
                        statusCode: rekeyed.statusCode,
                        staleGroups: rekeyed.staleGroups,
                        version: rekeyed.version,
                        users: rekeyed.users,
                        managers: rekeyed.managers,
                    },
                    entry: { statusCode: entry.statusCode, data: gk.dec(entry.data) },
                };
            },
            argsFor(backend, users),
        );

        expect(result.stale.statusCode).toEqual(0);
        expect(result.stale.staleGroups).toEqual([result.groupId]);
        expect(result.rekeyed.statusCode).toEqual(0);
        expect(result.rekeyed.staleGroups).toEqual([]);
        // Exactly one re-key: a rotation appends one history entry and nothing else wrote.
        expect(result.rekeyed.version).toEqual(result.stale.version + 1);
        expect(result.rekeyed.users).toEqual(result.stale.users);
        expect(result.rekeyed.managers).toEqual(result.stale.managers);
        expect(result.entry.statusCode).toEqual(0);
        expect(result.entry.data).toEqual("auto_data");
    });
});
