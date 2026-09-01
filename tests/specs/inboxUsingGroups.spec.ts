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

// Port of the endpoint's own InboxUsingGroupsTest.cpp - how InboxApi behaves
// when an Inbox's access comes from a group grant rather than its own roster.
// See threadUsingGroups.spec.ts for the three ways this harness differs from
// the C++ fixture (minted groups, concurrent sockets, `groupEpoch: 0`).
//
// An Inbox is three containers, not one: the Inbox itself plus an inner Thread
// for entries and an inner Store for their attachments. `createInbox` has to
// propagate a grant to all three, and `rotateInboxKeys` has to re-wrap all
// three - which is what the entry reads below actually prove.
//
// Entries are sealed to the Inbox's public key, so any connection can submit
// one; `prepareEntry` takes an attachment-handle list, empty here.
test.describe("InboxUsingGroupsTest", () => {
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

    test("createInbox with group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const inboxApi = await window.Endpoint.createInboxApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const inboxId = await inboxApi.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("public_meta"),
                    gk.enc("private_meta"),
                    undefined,
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const inbox = await inboxApi.getInbox(inboxId);

                return {
                    groupId: group1.groupId,
                    groupStatusCode: group1.statusCode,
                    groupPubKey: group1.groupPubKey,
                    inboxId,
                    statusCode: inbox.statusCode,
                    publicMeta: gk.dec(inbox.publicMeta),
                    groups: inbox.groups,
                };
            },
            argsFor(backend, users),
        );

        expect(result.groupStatusCode).toEqual(0);
        expect(result.groupPubKey).not.toEqual("");
        expect(result.inboxId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.publicMeta).toEqual("public_meta");
        expect(result.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
    });

    test("createInbox with multiple group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const inboxApi = await window.Endpoint.createInboxApi(conn);
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
                const inboxId = await inboxApi.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("two_groups_public"),
                    gk.enc("two_groups_private"),
                    undefined,
                    undefined,
                    [gk.grant(group1, "user"), gk.grant(group2, "manager")],
                );
                const inbox = await inboxApi.getInbox(inboxId);

                return {
                    group1: group1.groupId,
                    group2: group2.groupId,
                    statusCode: inbox.statusCode,
                    groups: inbox.groups,
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

    test("createInbox without groups has an empty groups field", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const inboxApi = await window.Endpoint.createInboxApi(conn);
                const u1 = gk.u(users.u1);

                const inboxId = await inboxApi.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("no_groups_public"),
                    gk.enc("no_groups_private"),
                );
                const inbox = await inboxApi.getInbox(inboxId);
                return { inboxId, statusCode: inbox.statusCode, groups: inbox.groups };
            },
            argsFor(backend, users),
        );

        expect(result.inboxId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.groups).toEqual([]);
    });

    test("updateInbox adds a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const inboxApi = await window.Endpoint.createInboxApi(conn);
                const u1 = gk.u(users.u1);

                const inboxId = await inboxApi.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("before_group"),
                    gk.enc("before_group_private"),
                );
                const created = await inboxApi.getInbox(inboxId);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                await inboxApi.updateInbox(
                    inboxId,
                    [u1],
                    [u1],
                    gk.enc("after_group"),
                    gk.enc("after_group_private"),
                    undefined,
                    created.version,
                    false,
                    false,
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const updated = await inboxApi.getInbox(inboxId);

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

    test("updateInbox removes a group", async ({ page, backend, cli }) => {
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
                const inboxApi1 = await window.Endpoint.createInboxApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const inboxId = await inboxApi1.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("with_group"),
                    gk.enc("with_group_private"),
                    undefined,
                    gk.readAllContainerPolicy(),
                    [gk.grant(group2, "user")],
                );
                const created = await inboxApi1.getInbox(inboxId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const inboxApi2 = await window.Endpoint.createInboxApi(conn2);
                const beforeRemoval = await inboxApi2.getInbox(inboxId);
                await conn2.disconnect();

                await inboxApi1.updateInbox(
                    inboxId,
                    [u1],
                    [u1],
                    gk.enc("no_group_now"),
                    gk.enc("no_group_private"),
                    undefined,
                    created.version,
                    false,
                    false,
                    undefined,
                    [],
                );
                const updated = await inboxApi1.getInbox(inboxId);

                const conn2b = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const inboxApi2b = await window.Endpoint.createInboxApi(conn2b);
                const afterRemoval = await inboxApi2b.getInbox(inboxId);

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

    test("updateInbox changes a group's role", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const inboxApi = await window.Endpoint.createInboxApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const inboxId = await inboxApi.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("role_change"),
                    gk.enc("role_change_private"),
                    undefined,
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const created = await inboxApi.getInbox(inboxId);

                await inboxApi.updateInbox(
                    inboxId,
                    [u1],
                    [u1],
                    gk.enc("role_change"),
                    gk.enc("role_change_private"),
                    undefined,
                    created.version,
                    false,
                    false,
                    undefined,
                    [gk.grant(group1, "manager")],
                );
                const promoted = await inboxApi.getInbox(inboxId);

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

    test("listInboxes includes the groups field", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const inboxApi = await window.Endpoint.createInboxApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const inboxId = await inboxApi.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("listed_with_group"),
                    gk.enc("listed_with_group_private"),
                    undefined,
                    undefined,
                    [gk.grant(group1, "user")],
                );

                const list = await inboxApi.listInboxes(contextId, {
                    skip: 0,
                    limit: 100,
                    sortOrder: "desc",
                });
                const listed = list.readItems.find((i) => i.inboxId === inboxId);

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

    test("createInbox with an invalid group pubKey throws", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const inboxApi = await window.Endpoint.createInboxApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                await gk.expectError(() =>
                    inboxApi.createInbox(
                        contextId,
                        [u1],
                        [u1],
                        gk.enc("public"),
                        gk.enc("private"),
                        undefined,
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

    test("readEntry via a group grant", async ({ page, backend, cli }) => {
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
                const inboxApi1 = await window.Endpoint.createInboxApi(conn1);
                const u1 = gk.u(users.u1);

                // Entries live in the Inbox's inner Thread, which createInbox grants
                // to the same group - so this read exercises that propagation.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const inboxId = await inboxApi1.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_inbox_public"),
                    gk.enc("group_inbox_private"),
                    undefined,
                    undefined,
                    [gk.grant(group2, "user")],
                );
                const handle = await inboxApi1.prepareEntry(inboxId, gk.enc("entry_data"), []);
                await inboxApi1.sendEntry(handle);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const inboxApi2 = await window.Endpoint.createInboxApi(conn2);
                const list = await inboxApi2.listEntries(inboxId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });
                const entry = await inboxApi2.readEntry(list.readItems[0].entryId);

                return {
                    listed: list.readItems.length,
                    statusCode: entry.statusCode,
                    data: gk.dec(entry.data),
                };
            },
            argsFor(backend, users),
        );

        expect(result.listed).toEqual(1);
        expect(result.statusCode).toEqual(0);
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
                const inboxApi1 = await window.Endpoint.createInboxApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const inboxId = await inboxApi1.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_inbox_public"),
                    gk.enc("group_inbox_private"),
                    undefined,
                    undefined,
                    [gk.grant(group2, "user")],
                );
                for (const data of ["data1", "data2"]) {
                    const handle = await inboxApi1.prepareEntry(inboxId, gk.enc(data), []);
                    await inboxApi1.sendEntry(handle);
                }

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const inboxApi2 = await window.Endpoint.createInboxApi(conn2);
                const list = await inboxApi2.listEntries(inboxId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });

                return {
                    totalAvailable: list.totalAvailable,
                    statusCodes: list.readItems.map((e) => e.statusCode),
                    datas: list.readItems.map((e) => gk.dec(e.data)),
                };
            },
            argsFor(backend, users),
        );

        expect(result.totalAvailable).toEqual(2);
        expect(result.statusCodes).toEqual([0, 0]);
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
                const inboxApi1 = await window.Endpoint.createInboxApi(conn1);
                const u1 = gk.u(users.u1);

                const group3 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "group_3",
                );
                const inboxId = await inboxApi1.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_inbox_public"),
                    gk.enc("group_inbox_private"),
                    undefined,
                    undefined,
                    [gk.grant(group3, "user")],
                );
                const handle = await inboxApi1.prepareEntry(inboxId, gk.enc("shared_data"), []);
                await inboxApi1.sendEntry(handle);

                const readAs = async (privKey: string) => {
                    const conn = await window.Endpoint.connect(privKey, solutionId, bridgeUrl);
                    const api = await window.Endpoint.createInboxApi(conn);
                    const list = await api.listEntries(inboxId, {
                        skip: 0,
                        limit: 10,
                        sortOrder: "desc",
                    });
                    const entry = await api.readEntry(list.readItems[0].entryId);
                    return {
                        listed: list.readItems.length,
                        statusCode: entry.statusCode,
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
            expect(seen.listed).toEqual(1);
            expect(seen.statusCode).toEqual(0);
            expect(seen.data).toEqual("shared_data");
        }
    });

    test("a user added to a granted group gains access to the inbox and its entries", async ({
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
                const inboxApi1 = await window.Endpoint.createInboxApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const inboxId = await inboxApi1.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_inbox_public"),
                    gk.enc("group_inbox_private"),
                    undefined,
                    gk.readAllContainerPolicy(),
                    [gk.grant(group2, "user")],
                );
                const handle = await inboxApi1.prepareEntry(inboxId, gk.enc("entry_data"), []);
                await inboxApi1.sendEntry(handle);

                // Capture the entry id from a member's connection while we have one.
                const ownerList = await inboxApi1.listEntries(inboxId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });
                const entryId = ownerList.readItems[0].entryId;

                const conn3 = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const inboxApi3 = await window.Endpoint.createInboxApi(conn3);
                const inboxBefore = await inboxApi3.getInbox(inboxId);
                await conn3.disconnect();

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
                const inboxApi3b = await window.Endpoint.createInboxApi(conn3b);
                const inboxAfter = await inboxApi3b.getInbox(inboxId);
                const entryAfter = await inboxApi3b.readEntry(entryId);

                return {
                    beforeInbox: inboxBefore.statusCode,
                    afterInbox: inboxAfter.statusCode,
                    afterEntry: {
                        statusCode: entryAfter.statusCode,
                        data: gk.dec(entryAfter.data),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.beforeInbox).not.toEqual(0);
        expect(result.afterInbox).toEqual(0);
        expect(result.afterEntry.statusCode).toEqual(0);
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
                const inboxApi = await window.Endpoint.createInboxApi(conn);
                const u1 = gk.u(users.u1);

                // Every keyId opens from `keys` and the group branch is skipped.
                // `updateInbox` is the interesting half: `verifyKeysSecret` fails on
                // any non-zero status and updateInbox runs it three times, once per
                // container, so an unresolved group entry there is the difference
                // between an update and an exception.
                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const inboxId = await inboxApi.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_inbox_public"),
                    gk.enc("group_inbox_private"),
                    undefined,
                    undefined,
                    gk.grants([group1]),
                );
                const handle = await inboxApi.prepareEntry(inboxId, gk.enc("direct_data"), []);
                await inboxApi.sendEntry(handle);

                const inbox = await inboxApi.getInbox(inboxId);
                const list = await inboxApi.listEntries(inboxId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });
                const entry = await inboxApi.readEntry(list.readItems[0].entryId);

                await inboxApi.updateInbox(
                    inboxId,
                    [u1],
                    [u1],
                    gk.enc("direct_updated_public"),
                    gk.enc("direct_updated_private"),
                    undefined,
                    inbox.version,
                    false,
                    false,
                    undefined,
                    gk.grants([group1]),
                );
                const updated = await inboxApi.getInbox(inboxId);

                return {
                    inbox: { statusCode: inbox.statusCode, groups: inbox.groups.length },
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

        expect(result.inbox.statusCode).toEqual(0);
        expect(result.inbox.groups).toEqual(1);
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
                const inboxApi1 = await window.Endpoint.createInboxApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                const group1 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const inboxId = await inboxApi1.createInbox(
                    contextId,
                    [u1, u2],
                    [u1, u2],
                    gk.enc("group_inbox_public"),
                    gk.enc("group_inbox_private"),
                    undefined,
                    undefined,
                    gk.grants([group1]),
                );
                const handle = await inboxApi1.prepareEntry(inboxId, gk.enc("nogroup_data"), []);
                await inboxApi1.sendEntry(handle);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const inboxApi2 = await window.Endpoint.createInboxApi(conn2);
                const inbox = await inboxApi2.getInbox(inboxId);
                const list = await inboxApi2.listEntries(inboxId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });
                const entry = await inboxApi2.readEntry(list.readItems[0].entryId);

                return {
                    inbox: { statusCode: inbox.statusCode, groups: inbox.groups.length },
                    entry: { statusCode: entry.statusCode, data: gk.dec(entry.data) },
                };
            },
            argsFor(backend, users),
        );

        expect(result.inbox.statusCode).toEqual(0);
        // `groups` stays unnarrowed, so user_2 still sees the grant it is not part of.
        expect(result.inbox.groups).toEqual(1);
        expect(result.entry.statusCode).toEqual(0);
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
                const inboxApi1 = await window.Endpoint.createInboxApi(conn1);
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
                const inboxId = await inboxApi1.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_inbox_public"),
                    gk.enc("group_inbox_private"),
                    undefined,
                    undefined,
                    gk.grants([group2, group3]),
                );
                const handle = await inboxApi1.prepareEntry(inboxId, gk.enc("twogroups_data"), []);
                await inboxApi1.sendEntry(handle);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const inboxApi2 = await window.Endpoint.createInboxApi(conn2);
                const inbox = await inboxApi2.getInbox(inboxId);
                const list = await inboxApi2.listEntries(inboxId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });
                const entry = await inboxApi2.readEntry(list.readItems[0].entryId);

                return {
                    inbox: { statusCode: inbox.statusCode, groups: inbox.groups.length },
                    entry: { statusCode: entry.statusCode, data: gk.dec(entry.data) },
                };
            },
            argsFor(backend, users),
        );

        expect(result.inbox.statusCode).toEqual(0);
        expect(result.inbox.groups).toEqual(2);
        expect(result.entry.statusCode).toEqual(0);
        expect(result.entry.data).toEqual("twogroups_data");
    });

    // =========================================================================
    // RE-KEYING AND STALE EPOCHS
    // =========================================================================

    test("rotateInboxKeys covers a grantee group the caller did not name", async ({
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
                const inboxApi1 = await window.Endpoint.createInboxApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                const granteeGroup = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const inboxId = await inboxApi1.createInbox(
                    contextId,
                    [u1, u2],
                    [u1, u2],
                    gk.enc("group_inbox_public"),
                    gk.enc("group_inbox_private"),
                    undefined,
                    undefined,
                    gk.grants([granteeGroup]),
                );
                const before = await inboxApi1.getInbox(inboxId);

                // user_2 re-keys without naming any group at all. The new key must
                // still reach the group across the Inbox and both inner containers.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const inboxApi2 = await window.Endpoint.createInboxApi(conn2);
                await inboxApi2.rotateInboxKeys(
                    inboxId,
                    [u1, u2],
                    [u1, u2],
                    before.version,
                    false,
                    [],
                );

                const after = await inboxApi1.getInbox(inboxId);

                // An entry submitted after the re-key is readable, proving all three
                // containers got a usable key.
                const handle = await inboxApi1.prepareEntry(inboxId, gk.enc("post_rekey_data"), []);
                await inboxApi1.sendEntry(handle);
                const list = await inboxApi1.listEntries(inboxId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });
                const entry = await inboxApi1.readEntry(list.readItems[0].entryId);

                return {
                    groupId: granteeGroup.groupId,
                    beforeStatusCode: before.statusCode,
                    after: { statusCode: after.statusCode, groups: after.groups },
                    entry: { statusCode: entry.statusCode, data: gk.dec(entry.data) },
                };
            },
            argsFor(backend, users),
        );

        expect(result.beforeStatusCode).toEqual(0);
        expect(result.after.statusCode).toEqual(0);
        expect(result.after.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
        expect(result.entry.statusCode).toEqual(0);
        expect(result.entry.data).toEqual("post_rekey_data");
    });

    test("rotateInboxKeys clears staleGroups after the group advances its epoch", async ({
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
                const inboxApi1 = await window.Endpoint.createInboxApi(conn1);
                const u1 = gk.u(users.u1);

                const group = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "grp",
                );
                const inboxId = await inboxApi1.createInbox(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_inbox_public"),
                    gk.enc("group_inbox_private"),
                    undefined,
                    undefined,
                    gk.grants([group]),
                );
                const handle = await inboxApi1.prepareEntry(inboxId, gk.enc("old_epoch_data"), []);
                await inboxApi1.sendEntry(handle);
                const ownerList = await inboxApi1.listEntries(inboxId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });
                const oldEpochEntryId = ownerList.readItems[0].entryId;

                await groupApi1.removeGroupMember(
                    group.groupId,
                    users.u3.id,
                    [gk.u(users.u1), gk.u(users.u2)],
                    [gk.u(users.u1)],
                    gk.enc("grp_removed_pub"),
                    gk.enc("grp_removed_priv"),
                );
                const rotatedGroup = await groupApi1.getGroup(group.groupId);
                const stale = await inboxApi1.getInbox(inboxId);

                await inboxApi1.rotateInboxKeys(inboxId, [u1], [u1], stale.version, false, []);
                const fresh = await inboxApi1.getInbox(inboxId);

                // user_2 is still in the group at epoch 2 and was never a direct Inbox
                // member, so this read can only go through the re-wrapped entries - on
                // the Inbox *and* on its inner Thread, where the entry lives.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const inboxApi2 = await window.Endpoint.createInboxApi(conn2);
                const oldEpochEntry = await inboxApi2.readEntry(oldEpochEntryId);

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
                        data: gk.dec(oldEpochEntry.data),
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
        expect(result.oldEpochEntry.data).toEqual("old_epoch_data");
    });
});
