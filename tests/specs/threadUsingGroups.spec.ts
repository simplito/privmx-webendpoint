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

// Port of the endpoint's own ThreadUsingGroupsTest.cpp - how ThreadApi behaves
// when a Thread's access comes from a group grant rather than its own roster.
//
// Three things differ from the C++ fixture and shape every test below:
//
//   - The C++ fixture reads three pre-created groups out of the dataset ini:
//     Group_1 (user_1 alone), Group_2 (user_1 + user_2) and Group_3 (all
//     three), each managed by user_1. The Bridge here is seeded from
//     `datasets/defaultDataset`, which carries no groups, so every test mints
//     the ones it needs through `gk.mkGroup` under those same names.
//   - C++ switches identity by tearing the connection down and reconnecting.
//     Different users may hold concurrent sockets here, so a test only
//     reconnects when it needs a client whose caches are empty - after a group
//     roster change, say. The Bridge allows one authorized socket per user, so
//     reconnecting the *same* user means disconnecting the old one first.
//   - `groupEpoch: 0` on a grant (what `gk.grant` produces) is what makes the
//     endpoint resolve the group's current epoch from the Bridge. `gk.grantAt`
//     pins it instead, for the one test that needs to name an epoch.
test.describe("ThreadUsingGroupsTest", () => {
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

    test("createThread with group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const threadApi = await window.Endpoint.createThreadApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );

                const threadId = await threadApi.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("public_meta"),
                    gk.enc("private_meta"),
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const thread = await threadApi.getThread(threadId);

                return {
                    groupId: group1.groupId,
                    groupPubKey: group1.groupPubKey,
                    groupStatusCode: group1.statusCode,
                    threadId,
                    statusCode: thread.statusCode,
                    publicMeta: gk.dec(thread.publicMeta),
                    groups: thread.groups,
                };
            },
            argsFor(backend, users),
        );

        expect(result.groupStatusCode).toEqual(0);
        expect(result.groupPubKey).not.toEqual("");
        expect(result.threadId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.publicMeta).toEqual("public_meta");
        expect(result.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
    });

    test("createThread with multiple group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const threadApi = await window.Endpoint.createThreadApi(conn);
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

                const threadId = await threadApi.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("two_groups_public"),
                    gk.enc("two_groups_private"),
                    undefined,
                    [gk.grant(group1, "user"), gk.grant(group2, "manager")],
                );
                const thread = await threadApi.getThread(threadId);

                return {
                    group1: group1.groupId,
                    group2: group2.groupId,
                    statusCode: thread.statusCode,
                    groups: thread.groups,
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

    test("createThread without groups has an empty groups field", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const threadApi = await window.Endpoint.createThreadApi(conn);
                const u1 = gk.u(users.u1);

                const threadId = await threadApi.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("no_groups_public"),
                    gk.enc("no_groups_private"),
                );
                const thread = await threadApi.getThread(threadId);
                return { threadId, statusCode: thread.statusCode, groups: thread.groups };
            },
            argsFor(backend, users),
        );

        expect(result.threadId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.groups).toEqual([]);
    });

    test("updateThread adds a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const threadApi = await window.Endpoint.createThreadApi(conn);
                const u1 = gk.u(users.u1);

                const threadId = await threadApi.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("before_group"),
                    gk.enc("before_group_private"),
                );
                const created = await threadApi.getThread(threadId);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                await threadApi.updateThread(
                    threadId,
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
                const updated = await threadApi.getThread(threadId);

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

    test("updateThread removes a group", async ({ page, backend, cli }) => {
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                // Group_2 holds user_1 and user_2, so dropping the grant is what user_2 loses.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );

                // `get: "all"` so user_2 can always download the thread: after the
                // revocation it gets a non-zero statusCode and an empty
                // privateMeta, not an exception.
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("with_group"),
                    gk.enc("with_group_private"),
                    gk.readAllContainerPolicy(),
                    [gk.grant(group2, "user")],
                );
                const created = await threadApi1.getThread(threadId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const beforeRemoval = await threadApi2.getThread(threadId);
                await conn2.disconnect();

                await threadApi1.updateThread(
                    threadId,
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
                const updated = await threadApi1.getThread(threadId);

                // A fresh socket, so nothing is served out of the first session's caches.
                const conn2b = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2b = await window.Endpoint.createThreadApi(conn2b);
                const afterRemoval = await threadApi2b.getThread(threadId);

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
        // Downloadable, undecryptable: the key was never shared with user_2 directly.
        expect(result.after.statusCode).not.toEqual(0);
        expect(result.after.privateMeta).toEqual("");
    });

    test("updateThread changes a group's role", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const threadApi = await window.Endpoint.createThreadApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const threadId = await threadApi.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("role_change"),
                    gk.enc("role_change_private"),
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const created = await threadApi.getThread(threadId);

                await threadApi.updateThread(
                    threadId,
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
                const promoted = await threadApi.getThread(threadId);

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

    test("listThreads includes the groups field", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const threadApi = await window.Endpoint.createThreadApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const threadId = await threadApi.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("listed_with_group"),
                    gk.enc("listed_with_group_private"),
                    undefined,
                    [gk.grant(group1, "user")],
                );

                const list = await threadApi.listThreads(contextId, {
                    skip: 0,
                    limit: 100,
                    sortOrder: "desc",
                });
                const listed = list.readItems.find((t) => t.threadId === threadId);

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

    test("createThread with an invalid group pubKey throws", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const threadApi = await window.Endpoint.createThreadApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );

                await gk.expectError(() =>
                    threadApi.createThread(
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
    // ITEMS THROUGH THE GRANT
    // =========================================================================

    test("getMessage via a group grant", async ({ page, backend, cli }) => {
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    [gk.grant(group2, "user")],
                );
                const messageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("msg_public"),
                    gk.enc("msg_private"),
                    gk.enc("msg_data"),
                );

                // user_2 holds no direct key entry on the thread.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const message = await threadApi2.getMessage(messageId);

                return {
                    statusCode: message.statusCode,
                    privateMeta: gk.dec(message.privateMeta),
                    data: gk.dec(message.data),
                };
            },
            argsFor(backend, users),
        );

        expect(result.statusCode).toEqual(0);
        expect(result.privateMeta).toEqual("msg_private");
        expect(result.data).toEqual("msg_data");
    });

    test("listMessages via a group grant", async ({ page, backend, cli }) => {
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    [gk.grant(group2, "user")],
                );
                await threadApi1.sendMessage(
                    threadId,
                    gk.enc("pub1"),
                    gk.enc("priv1"),
                    gk.enc("data1"),
                );
                await threadApi1.sendMessage(
                    threadId,
                    gk.enc("pub2"),
                    gk.enc("priv2"),
                    gk.enc("data2"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const list = await threadApi2.listMessages(threadId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });

                return {
                    totalAvailable: list.totalAvailable,
                    statusCodes: list.readItems.map((m) => m.statusCode),
                    privateMetas: list.readItems.map((m) => gk.dec(m.privateMeta)),
                    datas: list.readItems.map((m) => gk.dec(m.data)),
                };
            },
            argsFor(backend, users),
        );

        expect(result.totalAvailable).toEqual(2);
        expect(result.statusCodes).toEqual([0, 0]);
        expect(result.privateMetas).toEqual(expect.arrayContaining(["priv1", "priv2"]));
        expect(result.datas).toEqual(expect.arrayContaining(["data1", "data2"]));
    });

    test("getMessage survives the grant's removal for the key it was written under", async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    gk.readAllPolicy(),
                    [gk.grant(group2, "user")],
                );
                const messageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("msg_public"),
                    gk.enc("secret_private"),
                    gk.enc("secret_data"),
                );
                const created = await threadApi1.getThread(threadId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const beforeRemoval = await threadApi2.getMessage(messageId);
                await conn2.disconnect();

                await threadApi1.updateThread(
                    threadId,
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
                const newMessageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("new_msg_public"),
                    gk.enc("new_msg_private"),
                    gk.enc("new_msg_data"),
                );

                const conn2b = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2b = await window.Endpoint.createThreadApi(conn2b);
                const afterRemoval = await threadApi2b.getMessage(messageId);
                const newMessage = await threadApi2b.getMessage(newMessageId);

                return {
                    before: {
                        statusCode: beforeRemoval.statusCode,
                        privateMeta: gk.dec(beforeRemoval.privateMeta),
                    },
                    after: {
                        statusCode: afterRemoval.statusCode,
                        privateMeta: gk.dec(afterRemoval.privateMeta),
                    },
                    newMessage: {
                        statusCode: newMessage.statusCode,
                        privateMeta: gk.dec(newMessage.privateMeta),
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
        expect(result.newMessage.statusCode).not.toEqual(0);
        expect(result.newMessage.privateMeta).toEqual("");
    });

    test("messages are accessible by all group members", async ({ page, backend, cli }) => {
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                const group3 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "group_3",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    [gk.grant(group3, "user")],
                );
                const messageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("shared_public"),
                    gk.enc("shared_private"),
                    gk.enc("shared_data"),
                );

                const readAs = async (privKey: string) => {
                    const conn = await window.Endpoint.connect(privKey, solutionId, bridgeUrl);
                    const api = await window.Endpoint.createThreadApi(conn);
                    const message = await api.getMessage(messageId);
                    return {
                        statusCode: message.statusCode,
                        privateMeta: gk.dec(message.privateMeta),
                        data: gk.dec(message.data),
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

    test("a user added to a granted group gains access to the thread and its messages", async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    gk.readAllPolicy(),
                    [gk.grant(group2, "user")],
                );
                const messageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("msg_pub"),
                    gk.enc("msg_priv"),
                    gk.enc("msg_data"),
                );

                // user_3 is not in the group yet: it downloads but cannot decrypt.
                const conn3 = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi3 = await window.Endpoint.createThreadApi(conn3);
                const threadBefore = await threadApi3.getThread(threadId);
                const messageBefore = await threadApi3.getMessage(messageId);
                await conn3.disconnect();

                // Seat user_3's leaf in the key tree. A metadata write would not:
                // updateGroupPublicMeta/PrivateMeta never touch tree leaf state.
                await groupApi1.addGroupMembers(group2.groupId, [
                    { user: gk.u(users.u3), role: "user" },
                ]);

                const conn3b = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi3b = await window.Endpoint.createThreadApi(conn3b);
                const threadAfter = await threadApi3b.getThread(threadId);
                const messageAfter = await threadApi3b.getMessage(messageId);

                return {
                    beforeThread: threadBefore.statusCode,
                    beforeMessage: messageBefore.statusCode,
                    afterThread: threadAfter.statusCode,
                    afterMessage: {
                        statusCode: messageAfter.statusCode,
                        privateMeta: gk.dec(messageAfter.privateMeta),
                        data: gk.dec(messageAfter.data),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.beforeThread).not.toEqual(0);
        expect(result.beforeMessage).not.toEqual(0);
        expect(result.afterThread).toEqual(0);
        expect(result.afterMessage.statusCode).toEqual(0);
        expect(result.afterMessage.privateMeta).toEqual("msg_priv");
        expect(result.afterMessage.data).toEqual("msg_data");
    });

    test("a message from a previous group epoch survives a forced thread rekey", async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                const group = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "grp",
                );

                // user_1 is the only direct member, so user_2's access is exclusively
                // through the grant - a direct wrap would let the flat-key path
                // succeed and mask whatever the group-epoch path does.
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    [gk.grant(group, "user")],
                );
                // Wrapped to the group's epoch-1 grant key only.
                const oldEpochMessageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("old_epoch_pub"),
                    gk.enc("old_epoch_priv"),
                    gk.enc("old_epoch_data"),
                );
                const created = await threadApi1.getThread(threadId);

                // Removing a member advances the group from epoch 1 to 2. The thread is untouched.
                await groupApi1.removeGroupMembers(group.groupId, [users.u3.id]);
                const rotatedGroup = await groupApi1.getGroup(group.groupId);

                // Force the thread's own key to rotate while re-granting the group at
                // its now-current epoch. The stored entry has to keep the epoch-1 wrap
                // resolvable for the old message alongside the new epoch-2 one - this
                // is exactly what the Epoch Ladder exists to cover.
                await threadApi1.updateThread(
                    threadId,
                    [u1],
                    [u1],
                    gk.enc("rekeyed_public"),
                    gk.enc("rekeyed_private"),
                    created.version,
                    false,
                    true, // forceGenerateNewKey
                    undefined,
                    [gk.grantAt(rotatedGroup, "user")],
                );
                const newEpochMessageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("new_epoch_pub"),
                    gk.enc("new_epoch_priv"),
                    gk.enc("new_epoch_data"),
                );

                // A freshly connected client, so its key cache is empty: the first
                // read has to resolve everything from the server's current state.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const oldEpochMessage = await threadApi2.getMessage(oldEpochMessageId);
                const newEpochMessage = await threadApi2.getMessage(newEpochMessageId);

                return {
                    groupKeyVersion: group.keyVersion,
                    rotatedKeyVersion: rotatedGroup.keyVersion,
                    oldEpoch: {
                        statusCode: oldEpochMessage.statusCode,
                        privateMeta: gk.dec(oldEpochMessage.privateMeta),
                        data: gk.dec(oldEpochMessage.data),
                    },
                    newEpoch: {
                        statusCode: newEpochMessage.statusCode,
                        privateMeta: gk.dec(newEpochMessage.privateMeta),
                        data: gk.dec(newEpochMessage.data),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.groupKeyVersion).toEqual(1);
        expect(result.rotatedKeyVersion).toEqual(2);
        expect(result.oldEpoch.statusCode).toEqual(0);
        expect(result.oldEpoch.privateMeta).toEqual("old_epoch_priv");
        expect(result.oldEpoch.data).toEqual("old_epoch_data");
        expect(result.newEpoch.statusCode).toEqual(0);
        expect(result.newEpoch.privateMeta).toEqual("new_epoch_priv");
        expect(result.newEpoch.data).toEqual("new_epoch_data");
    });

    test("sendMessage retries with a refreshed key after a thread rotation", async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                const group = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "grp",
                );

                // user_2 is a direct thread user, so sendMessage is allowed on its connection.
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1, u2],
                    [u1],
                    gk.enc("thread_pub"),
                    gk.enc("thread_priv"),
                    gk.readAllPolicy(),
                    [gk.grant(group, "user")],
                );

                // A second connection, kept alive: fetching the thread caches keyId K1.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const cached = await threadApi2.getThread(threadId);

                // user_1 rotates, so the server advances to K2 while conn2 still holds K1.
                const threadInfo = await threadApi1.getThread(threadId);
                await threadApi1.rotateThreadKeys(
                    threadId,
                    [u1, u2],
                    [u1],
                    threadInfo.version,
                    false,
                    [gk.grant(group, "user")],
                );

                // Sending with the stale K1: the Bridge answers INVALID_THREAD_KEY and
                // the endpoint fetches K2 and retries transparently.
                const messageId = await threadApi2.sendMessage(
                    threadId,
                    gk.enc("msg_pub"),
                    gk.enc("msg_priv"),
                    gk.enc("msg_data"),
                );
                const message = await threadApi1.getMessage(messageId);

                return {
                    cachedStatusCode: cached.statusCode,
                    messageId,
                    message: { statusCode: message.statusCode, data: gk.dec(message.data) },
                };
            },
            argsFor(backend, users),
        );

        expect(result.cachedStatusCode).toEqual(0);
        expect(result.messageId).toBeTruthy();
        expect(result.message.statusCode).toEqual(0);
        expect(result.message.data).toEqual("msg_data");
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
                const threadApi = await window.Endpoint.createThreadApi(conn);
                const u1 = gk.u(users.u1);

                // user_1 is the only direct member *and* a member of the granted group,
                // so every keyId opens from `keys` and the group branch is skipped.
                // `updateThread` is the interesting half: `verifyKeysSecret` fails on
                // any non-zero status, so an unresolved group entry there is the
                // difference between an update and an exception.
                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const threadId = await threadApi.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([group1]),
                );
                const messageId = await threadApi.sendMessage(
                    threadId,
                    gk.enc("direct_public"),
                    gk.enc("direct_private"),
                    gk.enc("direct_data"),
                );

                const thread = await threadApi.getThread(threadId);
                const message = await threadApi.getMessage(messageId);
                const list = await threadApi.listMessages(threadId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });

                await threadApi.updateThread(
                    threadId,
                    [u1],
                    [u1],
                    gk.enc("direct_updated_public"),
                    gk.enc("direct_updated_private"),
                    thread.version,
                    false,
                    false,
                    undefined,
                    gk.grants([group1]),
                );
                const updated = await threadApi.getThread(threadId);

                return {
                    thread: { statusCode: thread.statusCode, groups: thread.groups.length },
                    message: { statusCode: message.statusCode, data: gk.dec(message.data) },
                    list: {
                        totalAvailable: list.totalAvailable,
                        statusCodes: list.readItems.map((m) => m.statusCode),
                    },
                    updated: {
                        statusCode: updated.statusCode,
                        privateMeta: gk.dec(updated.privateMeta),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.thread.statusCode).toEqual(0);
        expect(result.thread.groups).toEqual(1);
        expect(result.message.statusCode).toEqual(0);
        expect(result.message.data).toEqual("direct_data");
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                // The thread grants a group whose only member is user_1. user_2 is a
                // direct member and belongs to no grantee group, so the Bridge serves
                // it `groupKeys: []` - the read has to come entirely from its own wrap.
                const group1 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1, u2],
                    [u1, u2],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([group1]),
                );
                const messageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("nogroup_public"),
                    gk.enc("nogroup_private"),
                    gk.enc("nogroup_data"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const thread = await threadApi2.getThread(threadId);
                const message = await threadApi2.getMessage(messageId);

                return {
                    thread: { statusCode: thread.statusCode, groups: thread.groups.length },
                    message: {
                        statusCode: message.statusCode,
                        privateMeta: gk.dec(message.privateMeta),
                        data: gk.dec(message.data),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.thread.statusCode).toEqual(0);
        // `groups` stays unnarrowed, so user_2 still sees the grant it is not part of.
        expect(result.thread.groups).toEqual(1);
        expect(result.message.statusCode).toEqual(0);
        expect(result.message.privateMeta).toEqual("nogroup_private");
        expect(result.message.data).toEqual("nogroup_data");
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                // The thread wraps its key to user_1 only. user_2 belongs to both
                // grantee groups, so narrowing leaves it two entries at the same keyId
                // and one of them has to carry the read.
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
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([group2, group3]),
                );
                const messageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("twogroups_public"),
                    gk.enc("twogroups_private"),
                    gk.enc("twogroups_data"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const thread = await threadApi2.getThread(threadId);
                const message = await threadApi2.getMessage(messageId);

                return {
                    thread: { statusCode: thread.statusCode, groups: thread.groups.length },
                    message: {
                        statusCode: message.statusCode,
                        privateMeta: gk.dec(message.privateMeta),
                        data: gk.dec(message.data),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.thread.statusCode).toEqual(0);
        expect(result.thread.groups).toEqual(2);
        expect(result.message.statusCode).toEqual(0);
        expect(result.message.privateMeta).toEqual("twogroups_private");
        expect(result.message.data).toEqual("twogroups_data");
    });

    test("a group-only member still reads after a container rekey", async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                // user_3's `keys` on the thread is empty, so both the original keyId
                // and the one the forced rekey mints must go down the group route.
                const group3 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "group_3",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([group3]),
                );
                const firstKeyMessageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("first_key_public"),
                    gk.enc("first_key_private"),
                    gk.enc("first_key_data"),
                );

                const beforeRekey = await threadApi1.getThread(threadId);
                await threadApi1.updateThread(
                    threadId,
                    [u1],
                    [u1],
                    gk.enc("rekeyed_public"),
                    gk.enc("rekeyed_private"),
                    beforeRekey.version,
                    false,
                    true, // forceGenerateNewKey
                    undefined,
                    gk.grants([group3]),
                );
                const secondKeyMessageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("second_key_public"),
                    gk.enc("second_key_private"),
                    gk.enc("second_key_data"),
                );

                const conn3 = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi3 = await window.Endpoint.createThreadApi(conn3);
                const firstKeyMessage = await threadApi3.getMessage(firstKeyMessageId);
                const secondKeyMessage = await threadApi3.getMessage(secondKeyMessageId);
                const list = await threadApi3.listMessages(threadId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });

                return {
                    firstKey: {
                        statusCode: firstKeyMessage.statusCode,
                        data: gk.dec(firstKeyMessage.data),
                    },
                    secondKey: {
                        statusCode: secondKeyMessage.statusCode,
                        data: gk.dec(secondKeyMessage.data),
                    },
                    list: {
                        totalAvailable: list.totalAvailable,
                        statusCodes: list.readItems.map((m) => m.statusCode),
                        datas: list.readItems.map((m) => gk.dec(m.data)),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.firstKey.statusCode).toEqual(0);
        expect(result.firstKey.data).toEqual("first_key_data");
        expect(result.secondKey.statusCode).toEqual(0);
        expect(result.secondKey.data).toEqual("second_key_data");
        expect(result.list.totalAvailable).toEqual(2);
        expect(result.list.statusCodes).toEqual([0, 0]);
        expect(result.list.datas).toEqual(
            expect.arrayContaining(["first_key_data", "second_key_data"]),
        );
    });

    // =========================================================================
    // WHAT THE GRANT'S ROLE BUYS
    // =========================================================================

    test('a "user" role grantee can send a message', async ({ page, backend, cli }) => {
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                // `item.create` is "user" and every grant splices the caller into
                // `users`, so the weaker role already suffices to write new items.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([group2], "user"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const messageId = await threadApi2.sendMessage(
                    threadId,
                    gk.enc("grantee_public"),
                    gk.enc("grantee_private"),
                    gk.enc("grantee_data"),
                );
                const message = await threadApi2.getMessage(messageId);

                return {
                    messageId,
                    statusCode: message.statusCode,
                    data: gk.dec(message.data),
                    author: message.info.author,
                };
            },
            argsFor(backend, users),
        );

        expect(result.messageId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.data).toEqual("grantee_data");
        expect(result.author).toEqual(users.u2.id);
    });

    test('a "user" role grantee cannot update the thread', async ({ page, backend, cli }) => {
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                // `update` is "manager", and a "user" grant never reaches `managers`.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([group2], "user"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                // Positive control: the group route yields the container key, so the
                // rejection below is the policy check and not a failure to open it.
                const thread = await threadApi2.getThread(threadId);

                const rejected = await gk.caught(() =>
                    threadApi2.updateThread(
                        threadId,
                        [u1],
                        [u1],
                        gk.enc("denied_public"),
                        gk.enc("denied_private"),
                        thread.version,
                        false,
                        false,
                        undefined,
                        gk.grants([group2], "user"),
                    ),
                );

                return { readStatusCode: thread.statusCode, rejected };
            },
            argsFor(backend, users),
        );

        expect(result.readStatusCode).toEqual(0);
        expect(result.rejected).toBe(true);
    });

    test('a "manager" role grantee cannot update the thread while keeping the manager list', async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                // The one place "manager" is not enough. The update check runs
                // "is the updater being removed from managers" against the
                // group-aware copy - in which the grant has already put user_2 into
                // `managers` - while comparing it to the list the caller submitted.
                // So the update is refused for "removing" a manager who was never on
                // the stored list. Naming yourself in `managers` is the only way
                // through, and that makes the grantee a permanent *direct* manager
                // with its own key wrap - exactly what the grant was meant to avoid.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([group2], "manager"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const thread = await threadApi2.getThread(threadId);

                const rejected = await gk.caught(() =>
                    threadApi2.updateThread(
                        threadId,
                        [u1],
                        [u1],
                        gk.enc("trap_public"),
                        gk.enc("trap_private"),
                        thread.version,
                        false,
                        false,
                        undefined,
                        gk.grants([group2], "manager"),
                    ),
                );

                // Same call, same version - the refusal left the thread untouched -
                // but now naming user_2 as a manager of the container itself.
                await threadApi2.updateThread(
                    threadId,
                    [u1],
                    [u1, u2],
                    gk.enc("promoted_public"),
                    gk.enc("promoted_private"),
                    thread.version,
                    false,
                    false,
                    undefined,
                    gk.grants([group2], "manager"),
                );
                const updated = await threadApi2.getThread(threadId);

                return {
                    readStatusCode: thread.statusCode,
                    threadUsers: thread.users,
                    threadManagers: thread.managers,
                    rejected,
                    updated: {
                        statusCode: updated.statusCode,
                        privateMeta: gk.dec(updated.privateMeta),
                        managers: updated.managers,
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.readStatusCode).toEqual(0);
        // user_2 holds no direct membership: everything it does here goes through the grant.
        expect(result.threadUsers).not.toContain(users.u2.id);
        expect(result.threadManagers).not.toContain(users.u2.id);
        expect(result.rejected).toBe(true);
        expect(result.updated.statusCode).toEqual(0);
        expect(result.updated.privateMeta).toEqual("promoted_private");
        expect(result.updated.managers).toContain(users.u2.id);
    });

    test('a "manager" role grantee can update someone else\'s message', async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                // `item.update` is "itemOwner&user,manager": the second alternative is
                // met through the grant alone.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([group2], "manager"),
                );
                const messageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("owner_public"),
                    gk.enc("owner_private"),
                    gk.enc("owner_data"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                await threadApi2.updateMessage(
                    messageId,
                    gk.enc("edited_public"),
                    gk.enc("edited_private"),
                    gk.enc("edited_data"),
                );
                const edited = await threadApi2.getMessage(messageId);

                return { statusCode: edited.statusCode, data: gk.dec(edited.data) };
            },
            argsFor(backend, users),
        );

        expect(result.statusCode).toEqual(0);
        expect(result.data).toEqual("edited_data");
    });

    test('a "user" role grantee cannot update someone else\'s message', async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                // With a "user" grant only `itemOwner&user` can be met, and user_2
                // does not own this item.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([group2], "user"),
                );
                const messageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("owner_public"),
                    gk.enc("owner_private"),
                    gk.enc("owner_data"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                // Positive control: reading it is allowed (`item.get` is "user"), so
                // only the write is refused.
                const readable = await threadApi2.getMessage(messageId);
                const rejected = await gk.caught(() =>
                    threadApi2.updateMessage(
                        messageId,
                        gk.enc("edited_public"),
                        gk.enc("edited_private"),
                        gk.enc("edited_data"),
                    ),
                );

                return { readStatusCode: readable.statusCode, rejected };
            },
            argsFor(backend, users),
        );

        expect(result.readStatusCode).toEqual(0);
        expect(result.rejected).toBe(true);
    });

    test('a "manager" role grantee can delete the thread', async ({ page, backend, cli }) => {
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                // `delete` is "manager" and this path is guarded by the policy atom
                // alone, so the grant that cannot rename the thread can destroy it.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([group2], "manager"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                await threadApi2.deleteThread(threadId);
                const goneForGrantee = await gk.caught(() => threadApi2.getThread(threadId));
                const goneForOwner = await gk.caught(() => threadApi1.getThread(threadId));

                return { goneForGrantee, goneForOwner };
            },
            argsFor(backend, users),
        );

        expect(result.goneForGrantee).toBe(true);
        expect(result.goneForOwner).toBe(true);
    });

    test('a "user" role grantee cannot delete the thread', async ({ page, backend, cli }) => {
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([group2], "user"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const rejected = await gk.caught(() => threadApi2.deleteThread(threadId));
                const survived = await threadApi2.getThread(threadId);

                return { rejected, survivedStatusCode: survived.statusCode };
            },
            argsFor(backend, users),
        );

        expect(result.rejected).toBe(true);
        expect(result.survivedStatusCode).toEqual(0);
    });

    test("managing the granted group does not confer the container manager role", async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                // `getGroupsOfUser` matches `users` OR `managers` and returns a bare
                // list of ids, so the grant's own role is the only thing the policy
                // engine ever sees - being a manager *of the group* buys nothing.
                const managedGroup = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1, users.u2],
                    "mgr_group",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([managedGroup], "user"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const thread = await threadApi2.getThread(threadId);

                // Container-user rights: yes.
                const messageId = await threadApi2.sendMessage(
                    threadId,
                    gk.enc("grp_mgr_public"),
                    gk.enc("grp_mgr_private"),
                    gk.enc("grp_mgr_data"),
                );
                // Container-manager rights: no, despite managing the granted group.
                const updateRejected = await gk.caught(() =>
                    threadApi2.updateThread(
                        threadId,
                        [u1],
                        [u1],
                        gk.enc("grp_mgr_denied_public"),
                        gk.enc("grp_mgr_denied_private"),
                        thread.version,
                        false,
                        false,
                        undefined,
                        gk.grants([managedGroup], "user"),
                    ),
                );
                const deleteRejected = await gk.caught(() => threadApi2.deleteThread(threadId));

                return {
                    groupManagers: managedGroup.managers,
                    readStatusCode: thread.statusCode,
                    messageId,
                    updateRejected,
                    deleteRejected,
                };
            },
            argsFor(backend, users),
        );

        expect(result.groupManagers).toContain(users.u2.id);
        expect(result.readStatusCode).toEqual(0);
        expect(result.messageId).toBeTruthy();
        expect(result.updateRejected).toBe(true);
        expect(result.deleteRejected).toBe(true);
    });

    // =========================================================================
    // RE-KEYING AND STALE EPOCHS
    // =========================================================================

    test("rotateThreadKeys covers a grantee group the caller did not name", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                // The group is created by user_2 so it can manage it, but user_1 is a
                // member: wrapping a key to a group needs its current epoch and public
                // key, and the default group policy (`get: "user"`) hands those to
                // members only. A container granted to a group the caller is not in
                // therefore cannot be re-keyed at all.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi2 = await window.Endpoint.createGroupApi(conn2);
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const granteeGroup = await gk.mkGroup(
                    groupApi2,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u2],
                    "grantee_group",
                );

                // user_1 is a direct member - enough to re-key under the default
                // `rotateKeys: "user"`.
                const threadId = await threadApi2.createThread(
                    contextId,
                    [u1, u2],
                    [u2],
                    gk.enc("foreign_grant_public"),
                    gk.enc("foreign_grant_private"),
                    undefined,
                    gk.grants([granteeGroup]),
                );
                const beforeRotationMessageId = await threadApi2.sendMessage(
                    threadId,
                    gk.enc("before_rotation_public"),
                    gk.enc("before_rotation_private"),
                    gk.enc("before_rotation_data"),
                );

                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const thread = await threadApi1.getThread(threadId);

                // No `groups` argument at all: the grantee list has to come from the
                // thread itself, and a re-key that leaves the group without an entry
                // at the new keyId is refused outright.
                await threadApi1.rotateThreadKeys(threadId, [u1, u2], [u2], thread.version, false);
                const afterRotationMessageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("after_rotation_public"),
                    gk.enc("after_rotation_private"),
                    gk.enc("after_rotation_data"),
                );

                // user_3 reads only through the group and holds no direct entry at
                // either keyId, so this is what proves the new key reached the group.
                const conn3 = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi3 = await window.Endpoint.createThreadApi(conn3);
                const beforeRotation = await threadApi3.getMessage(beforeRotationMessageId);
                const afterRotation = await threadApi3.getMessage(afterRotationMessageId);

                return {
                    groupId: granteeGroup.groupId,
                    thread: {
                        statusCode: thread.statusCode,
                        groups: thread.groups,
                        staleGroups: thread.staleGroups,
                    },
                    beforeRotation: {
                        statusCode: beforeRotation.statusCode,
                        data: gk.dec(beforeRotation.data),
                    },
                    afterRotation: {
                        statusCode: afterRotation.statusCode,
                        data: gk.dec(afterRotation.data),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.thread.statusCode).toEqual(0);
        // The grant is there to be read off the thread - which is where the re-key has to get it.
        expect(result.thread.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
        expect(result.thread.staleGroups).toEqual([]);
        expect(result.beforeRotation.statusCode).toEqual(0);
        expect(result.beforeRotation.data).toEqual("before_rotation_data");
        expect(result.afterRotation.statusCode).toEqual(0);
        expect(result.afterRotation.data).toEqual("after_rotation_data");
    });

    test("rotateThreadKeys clears staleGroups after the group advances its epoch", async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                // `staleGroups` is the Bridge's answer to "does this thread need
                // re-keying", computed over every grant rather than over the entries
                // the caller can decrypt.
                const sharedGroup = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "stale_group",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([sharedGroup]),
                );

                // Removing a member advances the group's epoch and leaves the thread's
                // current key wrapped to the epoch before it.
                await groupApi1.removeGroupMembers(sharedGroup.groupId, [users.u3.id]);
                const stale = await threadApi1.getThread(threadId);

                // Again with no `groups`: the current epoch and its public key are
                // read from the group itself.
                await threadApi1.rotateThreadKeys(threadId, [u1], [u1], stale.version, false);
                const rekeyed = await threadApi1.getThread(threadId);

                const messageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("post_rekey_public"),
                    gk.enc("post_rekey_private"),
                    gk.enc("post_rekey_data"),
                );

                // user_2 is still in the group at its new epoch and holds no direct entry.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const message = await threadApi2.getMessage(messageId);

                return {
                    groupId: sharedGroup.groupId,
                    groupKeyVersion: sharedGroup.keyVersion,
                    stale: { statusCode: stale.statusCode, staleGroups: stale.staleGroups },
                    rekeyed: { statusCode: rekeyed.statusCode, staleGroups: rekeyed.staleGroups },
                    message: { statusCode: message.statusCode, data: gk.dec(message.data) },
                };
            },
            argsFor(backend, users),
        );

        expect(result.groupKeyVersion).toEqual(1);
        expect(result.stale.statusCode).toEqual(0);
        expect(result.stale.staleGroups).toEqual([result.groupId]);
        expect(result.rekeyed.statusCode).toEqual(0);
        expect(result.rekeyed.staleGroups).toEqual([]);
        expect(result.message.statusCode).toEqual(0);
        expect(result.message.data).toEqual("post_rekey_data");
    });

    test("sendMessage auto-rotates a stale thread key", async ({ page, backend, cli }) => {
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);

                // The same setup as above minus the rotateThreadKeys call: a stale key
                // is no longer the caller's problem to notice.
                const sharedGroup = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "auto_rotate_group",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([sharedGroup]),
                );
                await groupApi1.removeGroupMembers(sharedGroup.groupId, [users.u3.id]);
                const stale = await threadApi1.getThread(threadId);

                const messageId = await threadApi1.sendMessage(
                    threadId,
                    gk.enc("auto_rotated_public"),
                    gk.enc("auto_rotated_private"),
                    gk.enc("auto_rotated_data"),
                );
                const rekeyed = await threadApi1.getThread(threadId);

                // user_2 is in the group at its new epoch and holds no direct entry:
                // reading proves the new key was wrapped to the epoch the group
                // actually moved to, not the one the thread was stuck on.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const message = await threadApi2.getMessage(messageId);

                return {
                    groupId: sharedGroup.groupId,
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
                    message: { statusCode: message.statusCode, data: gk.dec(message.data) },
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
        // The roster a re-key may not touch.
        expect(result.rekeyed.users).toEqual(result.stale.users);
        expect(result.rekeyed.managers).toEqual(result.stale.managers);
        expect(result.message.statusCode).toEqual(0);
        expect(result.message.data).toEqual("auto_rotated_data");
    });

    test("auto-rotation does not repeat a re-key another client already did", async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                // Two clients both holding the thread at the same stale key. The
                // first one's send re-keys; the second's must notice the work is done
                // and send under the winner's key rather than re-keying on top of it.
                // The endpoint gets there by re-reading the thread before it rotates.
                const sharedGroup = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "concurrent_group",
                );
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1, u2],
                    [u1, u2],
                    gk.enc("group_thread_public"),
                    gk.enc("group_thread_private"),
                    undefined,
                    gk.grants([sharedGroup]),
                );
                await groupApi1.removeGroupMembers(sharedGroup.groupId, [users.u3.id]);

                // A second, independent connection as user_2, kept alive throughout.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);

                // Both read the thread while it is stale, so both cache a snapshot
                // that says "needs a re-key".
                const stale1 = await threadApi1.getThread(threadId);
                const stale2 = await threadApi2.getThread(threadId);

                // user_1 wins: its send re-keys.
                await threadApi1.sendMessage(
                    threadId,
                    gk.enc("winner_public"),
                    gk.enc("winner_private"),
                    gk.enc("winner_data"),
                );
                // user_2 still believes the thread is stale; its send must succeed
                // without a second re-key.
                const loserMessageId = await threadApi2.sendMessage(
                    threadId,
                    gk.enc("loser_public"),
                    gk.enc("loser_private"),
                    gk.enc("loser_data"),
                );

                const after = await threadApi1.getThread(threadId);
                const loserMessage = await threadApi1.getMessage(loserMessageId);

                return {
                    stale1: { staleGroups: stale1.staleGroups, version: stale1.version },
                    stale2: { staleGroups: stale2.staleGroups, version: stale2.version },
                    after: {
                        statusCode: after.statusCode,
                        staleGroups: after.staleGroups,
                        version: after.version,
                    },
                    loserMessage: {
                        statusCode: loserMessage.statusCode,
                        data: gk.dec(loserMessage.data),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.stale1.staleGroups).toHaveLength(1);
        expect(result.stale2.staleGroups).toHaveLength(1);
        expect(result.stale1.version).toEqual(result.stale2.version);
        expect(result.after.statusCode).toEqual(0);
        expect(result.after.staleGroups).toEqual([]);
        // One re-key, not two.
        expect(result.after.version).toEqual(result.stale1.version + 1);
        expect(result.loserMessage.statusCode).toEqual(0);
        expect(result.loserMessage.data).toEqual("loser_data");
    });

    // BLOCKED on a binding gap, not on this test: `VarDeserializer<ContainerPolicy>`
    // (endpoint/core/src/VarDeserializer.cpp) reads get / update / delete_ /
    // updatePolicy / updaterCanBeRemovedFromManagers / ownerCanBeRemovedFromManagers
    // / item - but neither `rotateKeys` nor `forwardSecrecy`, although
    // `VarDeserializer<ContainerPolicyWithoutItem>` reads both and `VarSerializer`
    // writes `rotateKeys` back out. So a `rotateKeys` set from JS is silently
    // dropped for every container that carries an item policy (Thread, Store,
    // Kvdb, StreamRoom, SearchIndex); it survives only on Inbox. Verified by
    // round-tripping `{get: "all", rotateKeys: "manager"}`: a Thread reads back
    // `rotateKeys: null` with `get: "all"` intact, an Inbox reads back
    // `rotateKeys: "manager"`.
    //
    // The C++ test sets the struct field directly and never crosses the
    // deserializer, which is why it passes there. Here the restriction never
    // reaches the server, so user_2 is allowed to re-key, auto-rotation succeeds
    // and `sendMessage` resolves instead of reporting the stale key. The body
    // below is the behavior we want and should pass unchanged once the two
    // missing lines are added to the deserializer.
    test.fixme("sendMessage still reports a stale key when the re-key is denied", async ({
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
                const threadApi1 = await window.Endpoint.createThreadApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                // Auto-rotation is not a way around the rotateKeys policy: a member
                // who may write but may not re-key gets the same stale-key error they
                // got before any of this existed, not an access error for a call they
                // never made.
                const sharedGroup = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "denied_group",
                );

                // `rotateKeys` is a real policy entry on the native side but is not
                // declared on the TS `ContainerWithoutItemPolicy`, hence the cast.
                const managerRotatesOnly = { rotateKeys: "manager" } as any;
                const threadId = await threadApi1.createThread(
                    contextId,
                    [u1, u2],
                    [u1],
                    gk.enc("denied_thread_public"),
                    gk.enc("denied_thread_private"),
                    managerRotatesOnly,
                    gk.grants([sharedGroup]),
                );
                await groupApi1.removeGroupMembers(sharedGroup.groupId, [users.u3.id]);
                const stale = await threadApi1.getThread(threadId);

                // user_2 is a thread user but not a manager.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const threadApi2 = await window.Endpoint.createThreadApi(conn2);
                const rejected = await gk.caught(() =>
                    threadApi2.sendMessage(
                        threadId,
                        gk.enc("denied_public"),
                        gk.enc("denied_private"),
                        gk.enc("denied_data"),
                    ),
                );

                // Nothing was re-keyed on the way to that error.
                const untouched = await threadApi1.getThread(threadId);

                return {
                    stale: { staleGroups: stale.staleGroups, version: stale.version },
                    rejected,
                    untouched: {
                        staleGroups: untouched.staleGroups,
                        version: untouched.version,
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.stale.staleGroups).toHaveLength(1);
        expect(result.rejected).toBe(true);
        expect(result.untouched.version).toEqual(result.stale.version);
        expect(result.untouched.staleGroups).toHaveLength(1);
    });
});
