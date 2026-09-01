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

// Port of the endpoint's own StoreUsingGroupsTest.cpp - how StoreApi behaves
// when a Store's access comes from a group grant rather than its own roster.
// See threadUsingGroups.spec.ts for the three ways this harness differs from
// the C++ fixture (minted groups, concurrent sockets, `groupEpoch: 0`).
test.describe("StoreUsingGroupsTest", () => {
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

    test("createStore with group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const storeApi = await window.Endpoint.createStoreApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const storeId = await storeApi.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("public_meta"),
                    gk.enc("private_meta"),
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const store = await storeApi.getStore(storeId);

                return {
                    groupId: group1.groupId,
                    groupStatusCode: group1.statusCode,
                    groupPubKey: group1.groupPubKey,
                    storeId,
                    statusCode: store.statusCode,
                    publicMeta: gk.dec(store.publicMeta),
                    groups: store.groups,
                };
            },
            argsFor(backend, users),
        );

        expect(result.groupStatusCode).toEqual(0);
        expect(result.groupPubKey).not.toEqual("");
        expect(result.storeId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.publicMeta).toEqual("public_meta");
        expect(result.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
    });

    test("createStore with multiple group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const storeApi = await window.Endpoint.createStoreApi(conn);
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
                const storeId = await storeApi.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("two_groups_public"),
                    gk.enc("two_groups_private"),
                    undefined,
                    [gk.grant(group1, "user"), gk.grant(group2, "manager")],
                );
                const store = await storeApi.getStore(storeId);

                return {
                    group1: group1.groupId,
                    group2: group2.groupId,
                    statusCode: store.statusCode,
                    groups: store.groups,
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

    test("createStore without groups has an empty groups field", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const storeApi = await window.Endpoint.createStoreApi(conn);
                const u1 = gk.u(users.u1);

                const storeId = await storeApi.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("no_groups_public"),
                    gk.enc("no_groups_private"),
                );
                const store = await storeApi.getStore(storeId);
                return { storeId, statusCode: store.statusCode, groups: store.groups };
            },
            argsFor(backend, users),
        );

        expect(result.storeId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.groups).toEqual([]);
    });

    test("updateStore adds a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const storeApi = await window.Endpoint.createStoreApi(conn);
                const u1 = gk.u(users.u1);

                const storeId = await storeApi.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("before_group"),
                    gk.enc("before_group_private"),
                );
                const created = await storeApi.getStore(storeId);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                await storeApi.updateStore(
                    storeId,
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
                const updated = await storeApi.getStore(storeId);

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

    test("updateStore removes a group", async ({ page, backend, cli }) => {
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
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("with_group"),
                    gk.enc("with_group_private"),
                    gk.readAllContainerPolicy(),
                    [gk.grant(group2, "user")],
                );
                const created = await storeApi1.getStore(storeId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2 = await window.Endpoint.createStoreApi(conn2);
                const beforeRemoval = await storeApi2.getStore(storeId);
                await conn2.disconnect();

                await storeApi1.updateStore(
                    storeId,
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
                const updated = await storeApi1.getStore(storeId);

                const conn2b = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2b = await window.Endpoint.createStoreApi(conn2b);
                const afterRemoval = await storeApi2b.getStore(storeId);

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

    test("updateStore changes a group's role", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const storeApi = await window.Endpoint.createStoreApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const storeId = await storeApi.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("role_change"),
                    gk.enc("role_change_private"),
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const created = await storeApi.getStore(storeId);

                await storeApi.updateStore(
                    storeId,
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
                const promoted = await storeApi.getStore(storeId);

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

    test("listStores includes the groups field", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const storeApi = await window.Endpoint.createStoreApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const storeId = await storeApi.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("listed_with_group"),
                    gk.enc("listed_with_group_private"),
                    undefined,
                    [gk.grant(group1, "user")],
                );

                const list = await storeApi.listStores(contextId, {
                    skip: 0,
                    limit: 100,
                    sortOrder: "desc",
                });
                const listed = list.readItems.find((s) => s.storeId === storeId);

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

    test("createStore with an invalid group pubKey throws", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const storeApi = await window.Endpoint.createStoreApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                await gk.expectError(() =>
                    storeApi.createStore(
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
    // FILES THROUGH THE GRANT
    // =========================================================================

    test("getFile via a group grant", async ({ page, backend, cli }) => {
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
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_store_public"),
                    gk.enc("group_store_private"),
                    undefined,
                    [gk.grant(group2, "user")],
                );
                const fileId = await gk.uploadFile(
                    storeApi1,
                    storeId,
                    "file_public",
                    "file_private",
                    "file_data",
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2 = await window.Endpoint.createStoreApi(conn2);
                const file = await storeApi2.getFile(fileId);
                const content = await gk.downloadFile(storeApi2, fileId, file.size);

                return {
                    fileId,
                    statusCode: file.statusCode,
                    privateMeta: gk.dec(file.privateMeta),
                    content,
                };
            },
            argsFor(backend, users),
        );

        expect(result.fileId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.privateMeta).toEqual("file_private");
        expect(result.content).toEqual("file_data");
    });

    test("listFiles via a group grant", async ({ page, backend, cli }) => {
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
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_store_public"),
                    gk.enc("group_store_private"),
                    undefined,
                    [gk.grant(group2, "user")],
                );
                await gk.uploadFile(storeApi1, storeId, "pub1", "priv1", "data1");
                await gk.uploadFile(storeApi1, storeId, "pub2", "priv2", "data2");

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2 = await window.Endpoint.createStoreApi(conn2);
                const list = await storeApi2.listFiles(storeId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });

                return {
                    totalAvailable: list.totalAvailable,
                    statusCodes: list.readItems.map((f) => f.statusCode),
                    privateMetas: list.readItems.map((f) => gk.dec(f.privateMeta)),
                };
            },
            argsFor(backend, users),
        );

        expect(result.totalAvailable).toEqual(2);
        expect(result.statusCodes).toEqual([0, 0]);
        expect(result.privateMetas).toEqual(expect.arrayContaining(["priv1", "priv2"]));
    });

    test("files are accessible by all group members", async ({ page, backend, cli }) => {
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
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                const group3 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "group_3",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_store_public"),
                    gk.enc("group_store_private"),
                    undefined,
                    [gk.grant(group3, "user")],
                );
                const fileId = await gk.uploadFile(
                    storeApi1,
                    storeId,
                    "shared_public",
                    "shared_private",
                    "shared_data",
                );

                const readAs = async (privKey: string) => {
                    const conn = await window.Endpoint.connect(privKey, solutionId, bridgeUrl);
                    const api = await window.Endpoint.createStoreApi(conn);
                    const file = await api.getFile(fileId);
                    return {
                        statusCode: file.statusCode,
                        privateMeta: gk.dec(file.privateMeta),
                        content: await gk.downloadFile(api, fileId, file.size),
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
            expect(seen.content).toEqual("shared_data");
        }
    });

    test("getFile survives the grant's removal for the key it was written under", async ({
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
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_store_public"),
                    gk.enc("group_store_private"),
                    gk.readAllPolicy(),
                    [gk.grant(group2, "user")],
                );
                const fileId = await gk.uploadFile(
                    storeApi1,
                    storeId,
                    "file_public",
                    "secret_private",
                    "secret_data",
                );
                const created = await storeApi1.getStore(storeId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2 = await window.Endpoint.createStoreApi(conn2);
                const beforeRemoval = await storeApi2.getFile(fileId);
                await conn2.disconnect();

                // Dropping the grant forces a new container key.
                await storeApi1.updateStore(
                    storeId,
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
                const newFileId = await gk.uploadFile(
                    storeApi1,
                    storeId,
                    "new_public",
                    "new_private",
                    "new_data",
                );

                const conn2b = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2b = await window.Endpoint.createStoreApi(conn2b);
                const afterRemoval = await storeApi2b.getFile(fileId);
                const newFile = await storeApi2b.getFile(newFileId);

                return {
                    before: {
                        statusCode: beforeRemoval.statusCode,
                        privateMeta: gk.dec(beforeRemoval.privateMeta),
                    },
                    after: {
                        statusCode: afterRemoval.statusCode,
                        privateMeta: gk.dec(afterRemoval.privateMeta),
                    },
                    newFile: {
                        statusCode: newFile.statusCode,
                        privateMeta: gk.dec(newFile.privateMeta),
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
        expect(result.newFile.statusCode).not.toEqual(0);
        expect(result.newFile.privateMeta).toEqual("");
    });

    test("a user added to a granted group gains access to the store and its files", async ({
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
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_store_public"),
                    gk.enc("group_store_private"),
                    gk.readAllPolicy(),
                    [gk.grant(group2, "user")],
                );
                const fileId = await gk.uploadFile(
                    storeApi1,
                    storeId,
                    "file_pub",
                    "file_priv",
                    "file_data",
                );

                const conn3 = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi3 = await window.Endpoint.createStoreApi(conn3);
                const storeBefore = await storeApi3.getStore(storeId);
                const fileBefore = await storeApi3.getFile(fileId);
                await conn3.disconnect();

                // Seat user_3's leaf in the key tree - updateGroup would only re-wrap
                // the group's own metadata key.
                await groupApi1.addGroupMember(
                    group2.groupId,
                    gk.u(users.u3),
                    false,
                    [gk.u(users.u1), gk.u(users.u2), gk.u(users.u3)],
                    [gk.u(users.u1)],
                    group2.publicMeta,
                    group2.privateMeta,
                );

                const conn3b = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi3b = await window.Endpoint.createStoreApi(conn3b);
                const storeAfter = await storeApi3b.getStore(storeId);
                const fileAfter = await storeApi3b.getFile(fileId);

                return {
                    beforeStore: storeBefore.statusCode,
                    beforeFile: fileBefore.statusCode,
                    afterStore: storeAfter.statusCode,
                    afterFile: {
                        statusCode: fileAfter.statusCode,
                        privateMeta: gk.dec(fileAfter.privateMeta),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.beforeStore).not.toEqual(0);
        expect(result.beforeFile).not.toEqual(0);
        expect(result.afterStore).toEqual(0);
        expect(result.afterFile.statusCode).toEqual(0);
        expect(result.afterFile.privateMeta).toEqual("file_priv");
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
                const storeApi = await window.Endpoint.createStoreApi(conn);
                const u1 = gk.u(users.u1);

                // Every keyId opens from `keys` and the group branch is skipped.
                // `updateStore` is the interesting half: `verifyKeysSecret` fails on
                // any non-zero status, so an unresolved group entry there is the
                // difference between an update and an exception.
                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const storeId = await storeApi.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_store_public"),
                    gk.enc("group_store_private"),
                    undefined,
                    gk.grants([group1]),
                );
                const fileId = await gk.uploadFile(
                    storeApi,
                    storeId,
                    "direct_public",
                    "direct_private",
                    "direct_data",
                );

                const store = await storeApi.getStore(storeId);
                const file = await storeApi.getFile(fileId);
                const content = await gk.downloadFile(storeApi, fileId, file.size);

                await storeApi.updateStore(
                    storeId,
                    [u1],
                    [u1],
                    gk.enc("direct_updated_public"),
                    gk.enc("direct_updated_private"),
                    store.version,
                    false,
                    false,
                    undefined,
                    gk.grants([group1]),
                );
                const updated = await storeApi.getStore(storeId);

                return {
                    store: { statusCode: store.statusCode, groups: store.groups.length },
                    file: { statusCode: file.statusCode, content },
                    updated: {
                        statusCode: updated.statusCode,
                        privateMeta: gk.dec(updated.privateMeta),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.store.statusCode).toEqual(0);
        expect(result.store.groups).toEqual(1);
        expect(result.file.statusCode).toEqual(0);
        expect(result.file.content).toEqual("direct_data");
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
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                // The Store grants a group whose only member is user_1, so the Bridge
                // serves user_2 `groupKeys: []` and the read comes from its own wrap.
                const group1 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1, u2],
                    [u1, u2],
                    gk.enc("group_store_public"),
                    gk.enc("group_store_private"),
                    undefined,
                    gk.grants([group1]),
                );
                const fileId = await gk.uploadFile(
                    storeApi1,
                    storeId,
                    "nogroup_public",
                    "nogroup_private",
                    "nogroup_data",
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2 = await window.Endpoint.createStoreApi(conn2);
                const store = await storeApi2.getStore(storeId);
                const file = await storeApi2.getFile(fileId);

                return {
                    store: { statusCode: store.statusCode, groups: store.groups.length },
                    file: { statusCode: file.statusCode, privateMeta: gk.dec(file.privateMeta) },
                };
            },
            argsFor(backend, users),
        );

        expect(result.store.statusCode).toEqual(0);
        // `groups` stays unnarrowed, so user_2 still sees the grant it is not part of.
        expect(result.store.groups).toEqual(1);
        expect(result.file.statusCode).toEqual(0);
        expect(result.file.privateMeta).toEqual("nogroup_private");
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
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
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
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_store_public"),
                    gk.enc("group_store_private"),
                    undefined,
                    gk.grants([group2, group3]),
                );
                const fileId = await gk.uploadFile(
                    storeApi1,
                    storeId,
                    "twogroups_public",
                    "twogroups_private",
                    "twogroups_data",
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2 = await window.Endpoint.createStoreApi(conn2);
                const store = await storeApi2.getStore(storeId);
                const file = await storeApi2.getFile(fileId);

                return {
                    store: { statusCode: store.statusCode, groups: store.groups.length },
                    file: { statusCode: file.statusCode, privateMeta: gk.dec(file.privateMeta) },
                };
            },
            argsFor(backend, users),
        );

        expect(result.store.statusCode).toEqual(0);
        expect(result.store.groups).toEqual(2);
        expect(result.file.statusCode).toEqual(0);
        expect(result.file.privateMeta).toEqual("twogroups_private");
    });

    // =========================================================================
    // RE-KEYING AND STALE EPOCHS
    // =========================================================================

    test("rotateStoreKeys covers a grantee group the caller did not name", async ({
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
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                // The grantee is a group the caller belongs to, and that is a
                // constraint rather than a convenience: wrapping a key to a group
                // needs its current epoch and public key, and the default group
                // policy (`get: "user"`) hands those to members only.
                const granteeGroup = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1, u2],
                    [u1, u2],
                    gk.enc("group_store_public"),
                    gk.enc("group_store_private"),
                    undefined,
                    gk.grants([granteeGroup]),
                );
                const before = await storeApi1.getStore(storeId);

                // user_2 re-keys without naming any group at all.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2 = await window.Endpoint.createStoreApi(conn2);
                await storeApi2.rotateStoreKeys(
                    storeId,
                    [u1, u2],
                    [u1, u2],
                    before.version,
                    false,
                    [],
                );

                // The grant survives the re-key, and user_1 still resolves the new key.
                const after = await storeApi1.getStore(storeId);
                const fileId = await gk.uploadFile(
                    storeApi1,
                    storeId,
                    "post_rekey_pub",
                    "post_rekey_priv",
                    "post_rekey_data",
                );
                const file = await storeApi1.getFile(fileId);

                return {
                    groupId: granteeGroup.groupId,
                    beforeStatusCode: before.statusCode,
                    after: { statusCode: after.statusCode, groups: after.groups },
                    file: { statusCode: file.statusCode, privateMeta: gk.dec(file.privateMeta) },
                };
            },
            argsFor(backend, users),
        );

        expect(result.beforeStatusCode).toEqual(0);
        expect(result.after.statusCode).toEqual(0);
        expect(result.after.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
        // A file written under the new key is readable, proving the re-key produced a usable key.
        expect(result.file.statusCode).toEqual(0);
        expect(result.file.privateMeta).toEqual("post_rekey_priv");
    });

    test("rotateStoreKeys clears staleGroups after the group advances its epoch", async ({
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
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                const group = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "grp",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_store_public"),
                    gk.enc("group_store_private"),
                    undefined,
                    gk.grants([group]),
                );
                const oldEpochFileId = await gk.uploadFile(
                    storeApi1,
                    storeId,
                    "old_epoch_pub",
                    "old_epoch_priv",
                    "old_epoch_data",
                );

                await groupApi1.removeGroupMember(
                    group.groupId,
                    users.u3.id,
                    [gk.u(users.u1), gk.u(users.u2)],
                    [gk.u(users.u1)],
                    gk.enc("grp_removed_pub"),
                    gk.enc("grp_removed_priv"),
                );
                const rotatedGroup = await groupApi1.getGroup(group.groupId);
                const stale = await storeApi1.getStore(storeId);

                await storeApi1.rotateStoreKeys(storeId, [u1], [u1], stale.version, false, []);
                const fresh = await storeApi1.getStore(storeId);

                // user_2 is still in the group at epoch 2 and was never a direct
                // Store member, so this read can only go through the re-wrapped entry.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2 = await window.Endpoint.createStoreApi(conn2);
                const oldEpochFile = await storeApi2.getFile(oldEpochFileId);

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
                    oldEpochFile: {
                        statusCode: oldEpochFile.statusCode,
                        privateMeta: gk.dec(oldEpochFile.privateMeta),
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
        expect(result.oldEpochFile.statusCode).toEqual(0);
        expect(result.oldEpochFile.privateMeta).toEqual("old_epoch_priv");
    });

    test("uploading a file auto-rotates a stale store key", async ({ page, backend, cli }) => {
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
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                // The same ground as the test above minus the rotateStoreKeys call:
                // closing the file re-keys the Store and writes under the new key.
                const group = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "auto_grp",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_store_public"),
                    gk.enc("group_store_private"),
                    undefined,
                    gk.grants([group]),
                );
                await groupApi1.removeGroupMember(
                    group.groupId,
                    users.u3.id,
                    [gk.u(users.u1), gk.u(users.u2)],
                    [gk.u(users.u1)],
                    gk.enc("auto_grp_removed_pub"),
                    gk.enc("auto_grp_removed_priv"),
                );
                const stale = await storeApi1.getStore(storeId);

                const fileId = await gk.uploadFile(
                    storeApi1,
                    storeId,
                    "auto_pub",
                    "auto_priv",
                    "auto_data",
                );
                const rekeyed = await storeApi1.getStore(storeId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2 = await window.Endpoint.createStoreApi(conn2);
                const file = await storeApi2.getFile(fileId);
                const content = await gk.downloadFile(storeApi2, fileId, file.size);

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
                    file: { statusCode: file.statusCode, content },
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
        expect(result.file.statusCode).toEqual(0);
        expect(result.file.content).toEqual("auto_data");
    });
});
