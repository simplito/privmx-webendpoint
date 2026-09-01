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

// Port of the endpoint's own StreamRoomUsingGroupsTest.cpp - how StreamApi's
// Stream Room half behaves when a room's access comes from a group grant rather
// than its own roster. See threadUsingGroups.spec.ts for the three ways this
// harness differs from the C++ fixture (minted groups, concurrent sockets,
// `groupEpoch: 0`).
//
// A Stream Room holds no items, so these are container-level tests throughout:
// nothing here joins a room or negotiates media, and no Janus is involved.
test.describe("StreamRoomUsingGroupsTest", () => {
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

    test("createStreamRoom with group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const streamApi = await window.Endpoint.createStreamApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const streamRoomId = await streamApi.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("public_meta"),
                    gk.enc("private_meta"),
                    undefined,
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const room = await streamApi.getStreamRoom(streamRoomId);

                return {
                    groupId: group1.groupId,
                    groupStatusCode: group1.statusCode,
                    groupPubKey: group1.groupPubKey,
                    streamRoomId,
                    statusCode: room.statusCode,
                    publicMeta: gk.dec(room.publicMeta),
                    groups: room.groups,
                };
            },
            argsFor(backend, users),
        );

        expect(result.groupStatusCode).toEqual(0);
        expect(result.groupPubKey).not.toEqual("");
        expect(result.streamRoomId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.publicMeta).toEqual("public_meta");
        expect(result.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
    });

    test("createStreamRoom with multiple group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const streamApi = await window.Endpoint.createStreamApi(conn);
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
                const streamRoomId = await streamApi.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("two_groups_public"),
                    gk.enc("two_groups_private"),
                    undefined,
                    undefined,
                    [gk.grant(group1, "user"), gk.grant(group2, "manager")],
                );
                const room = await streamApi.getStreamRoom(streamRoomId);

                return {
                    group1: group1.groupId,
                    group2: group2.groupId,
                    statusCode: room.statusCode,
                    groups: room.groups,
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

    test("createStreamRoom without groups has an empty groups field", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const streamApi = await window.Endpoint.createStreamApi(conn);
                const u1 = gk.u(users.u1);

                const streamRoomId = await streamApi.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("no_groups_public"),
                    gk.enc("no_groups_private"),
                );
                const room = await streamApi.getStreamRoom(streamRoomId);
                return { streamRoomId, statusCode: room.statusCode, groups: room.groups };
            },
            argsFor(backend, users),
        );

        expect(result.streamRoomId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.groups).toEqual([]);
    });

    test("updateStreamRoom adds a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const streamApi = await window.Endpoint.createStreamApi(conn);
                const u1 = gk.u(users.u1);

                const streamRoomId = await streamApi.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("before_group"),
                    gk.enc("before_group_private"),
                );
                const created = await streamApi.getStreamRoom(streamRoomId);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                await streamApi.updateStreamRoom(
                    streamRoomId,
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
                const updated = await streamApi.getStreamRoom(streamRoomId);

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

    test("updateStreamRoom removes a group", async ({ page, backend, cli }) => {
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
                const streamApi1 = await window.Endpoint.createStreamApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const streamRoomId = await streamApi1.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("with_group"),
                    gk.enc("with_group_private"),
                    gk.readAllContainerPolicy(),
                    undefined,
                    [gk.grant(group2, "user")],
                );
                const created = await streamApi1.getStreamRoom(streamRoomId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const streamApi2 = await window.Endpoint.createStreamApi(conn2);
                const beforeRemoval = await streamApi2.getStreamRoom(streamRoomId);
                await conn2.disconnect();

                await streamApi1.updateStreamRoom(
                    streamRoomId,
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
                const updated = await streamApi1.getStreamRoom(streamRoomId);

                const conn2b = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const streamApi2b = await window.Endpoint.createStreamApi(conn2b);
                const afterRemoval = await streamApi2b.getStreamRoom(streamRoomId);

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

    test("updateStreamRoom changes a group's role", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const streamApi = await window.Endpoint.createStreamApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const streamRoomId = await streamApi.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("role_change"),
                    gk.enc("role_change_private"),
                    undefined,
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const created = await streamApi.getStreamRoom(streamRoomId);

                await streamApi.updateStreamRoom(
                    streamRoomId,
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
                const promoted = await streamApi.getStreamRoom(streamRoomId);

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

    test("listStreamRooms includes the groups field", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const streamApi = await window.Endpoint.createStreamApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const streamRoomId = await streamApi.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("listed_with_group"),
                    gk.enc("listed_with_group_private"),
                    undefined,
                    undefined,
                    [gk.grant(group1, "user")],
                );

                const list = await streamApi.listStreamRooms(contextId, {
                    skip: 0,
                    limit: 100,
                    sortOrder: "desc",
                });
                const listed = list.readItems.find((r) => r.streamRoomId === streamRoomId);

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

    test("createStreamRoom with an invalid group pubKey throws", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const streamApi = await window.Endpoint.createStreamApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                await gk.expectError(() =>
                    streamApi.createStreamRoom(
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
    // READING THE ROOM THROUGH THE GRANT
    // =========================================================================

    test("getStreamRoom via a group grant", async ({ page, backend, cli }) => {
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
                const streamApi1 = await window.Endpoint.createStreamApi(conn1);
                const u1 = gk.u(users.u1);

                // user_2 is a group member and no direct member of the room, so this
                // read can only be served through the group entry.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const streamRoomId = await streamApi1.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_room_public"),
                    gk.enc("group_room_private"),
                    undefined,
                    undefined,
                    gk.grants([group2]),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const streamApi2 = await window.Endpoint.createStreamApi(conn2);
                const room = await streamApi2.getStreamRoom(streamRoomId);

                return { statusCode: room.statusCode, privateMeta: gk.dec(room.privateMeta) };
            },
            argsFor(backend, users),
        );

        expect(result.statusCode).toEqual(0);
        expect(result.privateMeta).toEqual("group_room_private");
    });

    test("the room is accessible by all group members", async ({ page, backend, cli }) => {
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
                const streamApi1 = await window.Endpoint.createStreamApi(conn1);
                const u1 = gk.u(users.u1);

                const group3 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "group_3",
                );
                const streamRoomId = await streamApi1.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_room_public"),
                    gk.enc("group_room_private"),
                    undefined,
                    undefined,
                    gk.grants([group3]),
                );

                const readAs = async (privKey: string) => {
                    const conn = await window.Endpoint.connect(privKey, solutionId, bridgeUrl);
                    const api = await window.Endpoint.createStreamApi(conn);
                    const room = await api.getStreamRoom(streamRoomId);
                    return { statusCode: room.statusCode, privateMeta: gk.dec(room.privateMeta) };
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
            expect(seen.privateMeta).toEqual("group_room_private");
        }
    });

    test("a user added to a granted group gains access to the room", async ({
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
                const streamApi1 = await window.Endpoint.createStreamApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const streamRoomId = await streamApi1.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("room_public"),
                    gk.enc("room_private"),
                    gk.readAllContainerPolicy(),
                    undefined,
                    [gk.grant(group2, "user")],
                );

                const conn3 = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const streamApi3 = await window.Endpoint.createStreamApi(conn3);
                const roomBefore = await streamApi3.getStreamRoom(streamRoomId);
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
                const streamApi3b = await window.Endpoint.createStreamApi(conn3b);
                const roomAfter = await streamApi3b.getStreamRoom(streamRoomId);

                return {
                    before: roomBefore.statusCode,
                    after: {
                        statusCode: roomAfter.statusCode,
                        privateMeta: gk.dec(roomAfter.privateMeta),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.before).not.toEqual(0);
        expect(result.after.statusCode).toEqual(0);
        expect(result.after.privateMeta).toEqual("room_private");
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
                const streamApi = await window.Endpoint.createStreamApi(conn);
                const u1 = gk.u(users.u1);

                // Every keyId opens from `keys` and the group branch is skipped.
                // `updateStreamRoom` is the interesting half: `verifyKeysSecret`
                // fails on any non-zero status, so an unresolved group entry there is
                // the difference between an update and an exception.
                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const streamRoomId = await streamApi.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_room_public"),
                    gk.enc("group_room_private"),
                    undefined,
                    undefined,
                    gk.grants([group1]),
                );
                const room = await streamApi.getStreamRoom(streamRoomId);

                await streamApi.updateStreamRoom(
                    streamRoomId,
                    [u1],
                    [u1],
                    gk.enc("direct_updated_public"),
                    gk.enc("direct_updated_private"),
                    room.version,
                    false,
                    false,
                    undefined,
                    gk.grants([group1]),
                );
                const updated = await streamApi.getStreamRoom(streamRoomId);

                return {
                    room: { statusCode: room.statusCode, groups: room.groups.length },
                    updated: {
                        statusCode: updated.statusCode,
                        privateMeta: gk.dec(updated.privateMeta),
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.room.statusCode).toEqual(0);
        expect(result.room.groups).toEqual(1);
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
                const streamApi1 = await window.Endpoint.createStreamApi(conn1);
                const u1 = gk.u(users.u1);
                const u2 = gk.u(users.u2);

                // The room grants a group whose only member is user_1, so the Bridge
                // serves user_2 `groupKeys: []` and the read comes from its own wrap.
                const group1 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const streamRoomId = await streamApi1.createStreamRoom(
                    contextId,
                    [u1, u2],
                    [u1, u2],
                    gk.enc("group_room_public"),
                    gk.enc("group_room_private"),
                    undefined,
                    undefined,
                    gk.grants([group1]),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const streamApi2 = await window.Endpoint.createStreamApi(conn2);
                const room = await streamApi2.getStreamRoom(streamRoomId);

                return {
                    statusCode: room.statusCode,
                    groups: room.groups.length,
                    privateMeta: gk.dec(room.privateMeta),
                };
            },
            argsFor(backend, users),
        );

        expect(result.statusCode).toEqual(0);
        // `groups` stays unnarrowed, so user_2 still sees the grant it is not part of.
        expect(result.groups).toEqual(1);
        expect(result.privateMeta).toEqual("group_room_private");
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
                const streamApi1 = await window.Endpoint.createStreamApi(conn1);
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
                const streamRoomId = await streamApi1.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_room_public"),
                    gk.enc("group_room_private"),
                    undefined,
                    undefined,
                    gk.grants([group2, group3]),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const streamApi2 = await window.Endpoint.createStreamApi(conn2);
                const room = await streamApi2.getStreamRoom(streamRoomId);

                return {
                    statusCode: room.statusCode,
                    groups: room.groups.length,
                    privateMeta: gk.dec(room.privateMeta),
                };
            },
            argsFor(backend, users),
        );

        expect(result.statusCode).toEqual(0);
        expect(result.groups).toEqual(2);
        expect(result.privateMeta).toEqual("group_room_private");
    });

    // =========================================================================
    // RE-KEYING AND STALE EPOCHS
    // =========================================================================

    test("rotateStreamRoomKeys covers a grantee group the caller did not name", async ({
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
                const streamApi1 = await window.Endpoint.createStreamApi(conn1);
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
                const streamRoomId = await streamApi1.createStreamRoom(
                    contextId,
                    [u1, u2],
                    [u1, u2],
                    gk.enc("group_room_public"),
                    gk.enc("group_room_private"),
                    undefined,
                    undefined,
                    gk.grants([granteeGroup]),
                );
                const before = await streamApi1.getStreamRoom(streamRoomId);

                // user_2 re-keys without naming any group at all.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const streamApi2 = await window.Endpoint.createStreamApi(conn2);
                await streamApi2.rotateStreamRoomKeys(
                    streamRoomId,
                    [u1, u2],
                    [u1, u2],
                    before.version,
                    false,
                    [],
                );

                // The grant survives the re-key, and user_1 still resolves the new key.
                const after = await streamApi1.getStreamRoom(streamRoomId);

                return {
                    groupId: granteeGroup.groupId,
                    beforeStatusCode: before.statusCode,
                    after: {
                        statusCode: after.statusCode,
                        privateMeta: gk.dec(after.privateMeta),
                        groups: after.groups,
                    },
                };
            },
            argsFor(backend, users),
        );

        expect(result.beforeStatusCode).toEqual(0);
        expect(result.after.statusCode).toEqual(0);
        expect(result.after.privateMeta).toEqual("group_room_private");
        expect(result.after.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
    });

    test("rotateStreamRoomKeys clears staleGroups after the group advances its epoch", async ({
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
                const streamApi1 = await window.Endpoint.createStreamApi(conn1);
                const u1 = gk.u(users.u1);

                const group = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "grp",
                );
                const streamRoomId = await streamApi1.createStreamRoom(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_room_public"),
                    gk.enc("group_room_private"),
                    undefined,
                    undefined,
                    gk.grants([group]),
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
                const stale = await streamApi1.getStreamRoom(streamRoomId);

                await streamApi1.rotateStreamRoomKeys(
                    streamRoomId,
                    [u1],
                    [u1],
                    stale.version,
                    false,
                    [],
                );
                const fresh = await streamApi1.getStreamRoom(streamRoomId);

                // user_2 is still in the group at epoch 2 and was never a direct room
                // member, so this read can only go through the re-wrapped entry.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const streamApi2 = await window.Endpoint.createStreamApi(conn2);
                const afterRekey = await streamApi2.getStreamRoom(streamRoomId);

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
                    afterRekey: {
                        statusCode: afterRekey.statusCode,
                        privateMeta: gk.dec(afterRekey.privateMeta),
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
        expect(result.afterRekey.statusCode).toEqual(0);
        expect(result.afterRekey.privateMeta).toEqual("group_room_private");
    });
});
