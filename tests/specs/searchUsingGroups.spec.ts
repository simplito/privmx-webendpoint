import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { IndexMode } from "../../src/Types";
import { setupUsers } from "../test-utils";
import { installGroupKit } from "../groupKit";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

// Port of the endpoint's own SearchUsingGroupsTest.cpp - how SearchApi behaves
// when an Index's access comes from a group grant rather than its own roster.
// See threadUsingGroups.spec.ts for the three ways this harness differs from
// the C++ fixture (minted groups, concurrent sockets, `groupEpoch: 0`).
//
// Two things are specific to Search:
//
//   - An Index is two containers - a KVDB for its metadata and a Store for the
//     documents - so a grant has to reach both. The metadata reads below prove
//     the KVDB half; the document searches prove the Store half.
//   - `role` matters more here than for a plain container. *Opening* an Index
//     writes to it (SQLite creates its table and journal and takes locks before
//     a single document is read) and the default item policy is
//     "itemOwner&user,manager". A group whose members are expected to open the
//     Index therefore has to be granted "manager"; "user" is enough only to read
//     the Index's own metadata.
//
// `IndexMode` is a value, and the harness loads the standalone bundle (which
// exports only `Endpoint`), so it is passed in through page.evaluate args.
test.describe("SearchUsingGroupsTest", () => {
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
        indexMode: IndexMode,
    });

    // =========================================================================
    // GRANTS ON THE INDEX
    // =========================================================================

    test("createSearchIndex with group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const searchApi = await window.Endpoint.createSearchApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                const indexId = await searchApi.createSearchIndex(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_index_public"),
                    gk.enc("group_index_private"),
                    indexMode.WITH_CONTENT,
                    undefined,
                    gk.grants([group1], "manager"),
                );
                const index = await searchApi.getSearchIndex(indexId);

                return {
                    groupId: group1.groupId,
                    groupStatusCode: group1.statusCode,
                    indexId,
                    statusCode: index.statusCode,
                    publicMeta: gk.dec(index.publicMeta),
                    groups: index.groups,
                };
            },
            argsFor(backend, users),
        );

        expect(result.groupStatusCode).toEqual(0);
        expect(result.indexId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.publicMeta).toEqual("group_index_public");
        expect(result.groups).toEqual([{ groupId: result.groupId, role: "manager" }]);
    });

    test("createSearchIndex with multiple group grants", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const searchApi = await window.Endpoint.createSearchApi(conn);
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
                const indexId = await searchApi.createSearchIndex(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_index_public"),
                    gk.enc("group_index_private"),
                    indexMode.WITH_CONTENT,
                    undefined,
                    [gk.grant(group1, "user"), gk.grant(group2, "manager")],
                );
                const index = await searchApi.getSearchIndex(indexId);

                return {
                    group1: group1.groupId,
                    group2: group2.groupId,
                    statusCode: index.statusCode,
                    groups: index.groups,
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

    test("createSearchIndex without groups has an empty groups field", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const searchApi = await window.Endpoint.createSearchApi(conn);
                const u1 = gk.u(users.u1);

                const indexId = await searchApi.createSearchIndex(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("no_groups_public"),
                    gk.enc("no_groups_private"),
                    indexMode.WITH_CONTENT,
                );
                const index = await searchApi.getSearchIndex(indexId);
                return { indexId, statusCode: index.statusCode, groups: index.groups };
            },
            argsFor(backend, users),
        );

        expect(result.indexId).toBeTruthy();
        expect(result.statusCode).toEqual(0);
        expect(result.groups).toEqual([]);
    });

    test("createSearchIndex with an invalid group pubKey throws", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const searchApi = await window.Endpoint.createSearchApi(conn);
                const u1 = gk.u(users.u1);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                await gk.expectError(() =>
                    searchApi.createSearchIndex(
                        contextId,
                        [u1],
                        [u1],
                        gk.enc("public"),
                        gk.enc("private"),
                        indexMode.WITH_CONTENT,
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

    test("listSearchIndexes includes the groups field", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const searchApi = await window.Endpoint.createSearchApi(conn);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const indexId = await searchApi.createSearchIndex(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_index_public"),
                    gk.enc("group_index_private"),
                    indexMode.WITH_CONTENT,
                    undefined,
                    gk.grants([group2], "user"),
                );

                const list = await searchApi.listSearchIndexes(contextId, {
                    skip: 0,
                    limit: 100,
                    sortOrder: "desc",
                });
                const listed = list.readItems.find((i) => i.indexId === indexId);

                return {
                    groupId: group2.groupId,
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

    test("updateSearchIndex adds a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn = await window.Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const groupApi = await window.Endpoint.createGroupApi(conn);
                const searchApi = await window.Endpoint.createSearchApi(conn);
                const u1 = gk.u(users.u1);

                const indexId = await searchApi.createSearchIndex(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("add_group_public"),
                    gk.enc("add_group_private"),
                    indexMode.WITH_CONTENT,
                );
                const before = await searchApi.getSearchIndex(indexId);

                const group1 = await gk.mkGroup(
                    groupApi,
                    contextId,
                    [users.u1],
                    [users.u1],
                    "group_1",
                );
                await searchApi.updateSearchIndex(
                    indexId,
                    [u1],
                    [u1],
                    gk.enc("add_group_public_2"),
                    gk.enc("add_group_private_2"),
                    before.version,
                    false,
                    false,
                    undefined,
                    [gk.grant(group1, "user")],
                );
                const after = await searchApi.getSearchIndex(indexId);

                return {
                    groupId: group1.groupId,
                    beforeGroups: before.groups,
                    statusCode: after.statusCode,
                    publicMeta: gk.dec(after.publicMeta),
                    groups: after.groups,
                };
            },
            argsFor(backend, users),
        );

        expect(result.beforeGroups).toEqual([]);
        expect(result.statusCode).toEqual(0);
        expect(result.publicMeta).toEqual("add_group_public_2");
        expect(result.groups).toEqual([{ groupId: result.groupId, role: "user" }]);
    });

    test("updateSearchIndex removes a group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const searchApi1 = await window.Endpoint.createSearchApi(conn1);
                const u1 = gk.u(users.u1);

                // The grant list an update carries is authoritative: an empty one
                // revokes every grant the Index had.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const indexId = await searchApi1.createSearchIndex(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_index_public"),
                    gk.enc("group_index_private"),
                    indexMode.WITH_CONTENT,
                    undefined,
                    gk.grants([group2], "user"),
                );
                const granted = await searchApi1.getSearchIndex(indexId);

                await searchApi1.updateSearchIndex(
                    indexId,
                    [u1],
                    [u1],
                    gk.enc("revoked_public"),
                    gk.enc("revoked_private"),
                    granted.version,
                    false,
                    false,
                    undefined,
                    [],
                );
                const revoked = await searchApi1.getSearchIndex(indexId);

                // user_2's only route into the Index was the group, and the
                // revocation forced a new key.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const searchApi2 = await window.Endpoint.createSearchApi(conn2);
                const readRejected = await gk.caught(() => searchApi2.getSearchIndex(indexId));

                return {
                    grantedGroups: granted.groups.length,
                    revoked: { statusCode: revoked.statusCode, groups: revoked.groups },
                    readRejected,
                };
            },
            argsFor(backend, users),
        );

        expect(result.grantedGroups).toEqual(1);
        expect(result.revoked.statusCode).toEqual(0);
        expect(result.revoked.groups).toEqual([]);
        expect(result.readRejected).toBe(true);
    });

    // =========================================================================
    // READING AND SEARCHING THROUGH THE GRANT
    // =========================================================================

    test("a group member reads the index metadata", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const searchApi1 = await window.Endpoint.createSearchApi(conn1);
                const u1 = gk.u(users.u1);

                // "user" is enough for the Index's own metadata: that read is
                // served by the KVDB half alone, and proves its key was wrapped
                // to the group.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const indexId = await searchApi1.createSearchIndex(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_index_public"),
                    gk.enc("group_index_private"),
                    indexMode.WITH_CONTENT,
                    undefined,
                    gk.grants([group2], "user"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const searchApi2 = await window.Endpoint.createSearchApi(conn2);
                const index = await searchApi2.getSearchIndex(indexId);

                return {
                    indexId,
                    statusCode: index.statusCode,
                    readIndexId: index.indexId,
                    publicMeta: gk.dec(index.publicMeta),
                    privateMeta: gk.dec(index.privateMeta),
                    mode: index.mode,
                };
            },
            argsFor(backend, users),
        );

        expect(result.statusCode).toEqual(0);
        expect(result.readIndexId).toEqual(result.indexId);
        expect(result.publicMeta).toEqual("group_index_public");
        expect(result.privateMeta).toEqual("group_index_private");
        expect(result.mode).toEqual(IndexMode.WITH_CONTENT);
    });

    test("a group member searches documents", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const searchApi1 = await window.Endpoint.createSearchApi(conn1);
                const u1 = gk.u(users.u1);

                // The documents live in the Store half, so finding them proves
                // that half was granted too - and that every step of the open
                // (SQLite's table, its journal, its locks) went through the grant.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const indexId = await searchApi1.createSearchIndex(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_index_public"),
                    gk.enc("group_index_private"),
                    indexMode.WITH_CONTENT,
                    undefined,
                    gk.grants([group2], "manager"),
                );

                const seed = await searchApi1.openSearchIndex(indexId);
                await searchApi1.addDocument(seed, "doc-1", "alpha beta");
                await searchApi1.addDocument(seed, "doc-2", "gamma beta");
                await searchApi1.closeSearchIndex(seed);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const searchApi2 = await window.Endpoint.createSearchApi(conn2);
                const countMatches = async (query: string) => {
                    const handle = await searchApi2.openSearchIndex(indexId);
                    const found = await searchApi2.searchDocuments(handle, query, {
                        skip: 0,
                        limit: 10,
                        sortOrder: "asc",
                    });
                    await searchApi2.closeSearchIndex(handle);
                    return found.totalAvailable;
                };

                return {
                    beta: await countMatches("beta"),
                    alpha: await countMatches("alpha"),
                    delta: await countMatches("delta"),
                };
            },
            argsFor(backend, users),
        );

        expect(result.beta).toEqual(2);
        expect(result.alpha).toEqual(1);
        expect(result.delta).toEqual(0);
    });

    test("documents added by a group member are visible to the owner", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const searchApi1 = await window.Endpoint.createSearchApi(conn1);
                const u1 = gk.u(users.u1);

                const group3 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "group_3",
                );
                const indexId = await searchApi1.createSearchIndex(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_index_public"),
                    gk.enc("group_index_private"),
                    indexMode.WITH_CONTENT,
                    undefined,
                    gk.grants([group3], "manager"),
                );

                const countMatchesAs = async (api: any, query: string) => {
                    const handle = await api.openSearchIndex(indexId);
                    const found = await api.searchDocuments(handle, query, {
                        skip: 0,
                        limit: 10,
                        sortOrder: "asc",
                    });
                    await api.closeSearchIndex(handle);
                    return found.totalAvailable;
                };

                const ownerSeed = await searchApi1.openSearchIndex(indexId);
                await searchApi1.addDocument(ownerSeed, "doc-owner", "owner wrote this");
                await searchApi1.closeSearchIndex(ownerSeed);

                // user_3 is in the group and is not a direct member of the Index.
                const conn3 = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const searchApi3 = await window.Endpoint.createSearchApi(conn3);
                const memberSeed = await searchApi3.openSearchIndex(indexId);
                await searchApi3.addDocument(memberSeed, "doc-member", "member wrote this");
                await searchApi3.closeSearchIndex(memberSeed);

                const memberSeesWrote = await countMatchesAs(searchApi3, "wrote");
                const ownerSeesMember = await countMatchesAs(searchApi1, "member");
                const ownerSeesWrote = await countMatchesAs(searchApi1, "wrote");

                return { memberSeesWrote, ownerSeesMember, ownerSeesWrote };
            },
            argsFor(backend, users),
        );

        expect(result.memberSeesWrote).toEqual(2);
        expect(result.ownerSeesMember).toEqual(1);
        expect(result.ownerSeesWrote).toEqual(2);
    });

    test("a caller in no granted group cannot read the index", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const searchApi1 = await window.Endpoint.createSearchApi(conn1);
                const u1 = gk.u(users.u1);

                // The group holds user_1 and user_2; user_3 is in neither the
                // Index's roster nor its grantee group.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const indexId = await searchApi1.createSearchIndex(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_index_public"),
                    gk.enc("group_index_private"),
                    indexMode.WITH_CONTENT,
                    undefined,
                    gk.grants([group2], "user"),
                );

                const conn3 = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const searchApi3 = await window.Endpoint.createSearchApi(conn3);

                return {
                    getRejected: await gk.caught(() => searchApi3.getSearchIndex(indexId)),
                    openRejected: await gk.caught(() => searchApi3.openSearchIndex(indexId)),
                };
            },
            argsFor(backend, users),
        );

        expect(result.getRejected).toBe(true);
        expect(result.openRejected).toBe(true);
    });

    // =========================================================================
    // RE-KEYING AND STALE EPOCHS
    // =========================================================================

    test("rotateSearchIndexKeys clears staleGroups after the group advances its epoch", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const searchApi1 = await window.Endpoint.createSearchApi(conn1);
                const u1 = gk.u(users.u1);

                // The group is granted the Index at epoch 1. Removing a member
                // advances it to epoch 2, which leaves the Index's keys wrapped to
                // a superseded epoch - the Bridge reports that as `staleGroups`.
                // A re-key re-wraps *both* of the Index's containers to the
                // current epoch and must clear it.
                const group = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2, users.u3],
                    [users.u1],
                    "idx_grp",
                );
                const indexId = await searchApi1.createSearchIndex(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("group_index_public"),
                    gk.enc("group_index_private"),
                    indexMode.WITH_CONTENT,
                    undefined,
                    gk.grants([group], "manager"),
                );

                const seed = await searchApi1.openSearchIndex(indexId);
                await searchApi1.addDocument(seed, "doc-1", "epoch one document");
                await searchApi1.closeSearchIndex(seed);

                await groupApi1.removeGroupMembers(group.groupId, [users.u3.id]);
                const rotatedGroup = await groupApi1.getGroup(group.groupId);

                // Nothing may write to the Index between the removal and this
                // read: a write would re-key it on its own.
                const stale = await searchApi1.getSearchIndex(indexId);

                await searchApi1.rotateSearchIndexKeys(
                    indexId,
                    [u1],
                    [u1],
                    stale.version,
                    false,
                    [],
                );
                const fresh = await searchApi1.getSearchIndex(indexId);

                // user_2 is still in the group at epoch 2 and was never a direct
                // member of the Index, so this can only be served through the
                // re-wrapped group entries - of both halves, since it takes the
                // KVDB to find the Store.
                //
                // A read, deliberately: a random-write file carries the key id it
                // was opened under and the Bridge refuses a random write whose key
                // id is not the Store's current one. Documents written before a
                // re-key stay readable, but an Index has to be re-keyed before it
                // is opened, not while it is.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const searchApi2 = await window.Endpoint.createSearchApi(conn2);
                const handle = await searchApi2.openSearchIndex(indexId);
                const found = await searchApi2.searchDocuments(handle, "epoch", {
                    skip: 0,
                    limit: 10,
                    sortOrder: "asc",
                });
                await searchApi2.closeSearchIndex(handle);

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
                    matches: found.totalAvailable,
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
        expect(result.matches).toEqual(1);
    });
});
