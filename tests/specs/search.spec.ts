import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { IndexMode } from "../../src/Types";
import { setupUsers } from "../test-utils";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

// SearchApi depends on StoreApi + KvdbApi + LockApi, all resolved from the
// connection's IoC container on first use, so callers only pass the connection.
// IndexMode is a value, and the browser harness loads the standalone bundle
// (which exports only `Endpoint`), so it is passed in through page.evaluate args.
test.describe("SearchTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    test("search index CRUD: create, get, list, delete", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            indexMode: IndexMode,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                // StoreApi, KvdbApi and LockApi are resolved from the
                // connection's container automatically.
                const searchApi = await Endpoint.createSearchApi(connection);

                const enc = new TextEncoder();
                const dec = new TextDecoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                const indexId = await searchApi.createSearchIndex(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("public-meta"),
                    enc.encode("private-meta"),
                    indexMode.WITH_CONTENT,
                );

                const fetched = await searchApi.getSearchIndex(indexId);
                const listed = await searchApi.listSearchIndexes(contextId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });

                await searchApi.deleteSearchIndex(indexId);

                let getAfterDeleteThrew = false;
                try {
                    await searchApi.getSearchIndex(indexId);
                } catch {
                    getAfterDeleteThrew = true;
                }

                return {
                    indexId,
                    fetchedIndexId: fetched.indexId,
                    fetchedContextId: fetched.contextId,
                    fetchedMode: fetched.mode,
                    fetchedPublicMeta: dec.decode(fetched.publicMeta),
                    fetchedPrivateMeta: dec.decode(fetched.privateMeta),
                    listedIds: listed.readItems.map((i) => i.indexId),
                    getAfterDeleteThrew,
                };
            },
            args,
        );

        expect(result.indexId).toBeTruthy();
        expect(result.fetchedIndexId).toBe(result.indexId);
        expect(result.fetchedContextId).toBe(testData.contextId);
        expect(result.fetchedMode).toBe(IndexMode.WITH_CONTENT);
        expect(result.fetchedPublicMeta).toBe("public-meta");
        expect(result.fetchedPrivateMeta).toBe("private-meta");
        expect(result.listedIds).toContain(result.indexId);
        expect(result.getAfterDeleteThrew).toBe(true);
    });

    test("document lifecycle: open index, add, get, list, delete document, close", async ({
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
            indexMode: IndexMode,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                // StoreApi, KvdbApi and LockApi are resolved from the
                // connection's container automatically.
                const searchApi = await Endpoint.createSearchApi(connection);

                const enc = new TextEncoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                const indexId = await searchApi.createSearchIndex(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("p"),
                    enc.encode("p"),
                    indexMode.WITH_CONTENT,
                );

                const handle = await searchApi.openSearchIndex(indexId);

                const documentId = await searchApi.addDocument(
                    handle,
                    "notes.txt",
                    "the quick brown fox",
                );
                const fetched = await searchApi.getDocument(handle, documentId);
                const listed = await searchApi.listDocuments(handle, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });

                await searchApi.deleteDocument(handle, documentId);
                const listedAfterDelete = await searchApi.listDocuments(handle, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "desc",
                });

                await searchApi.closeSearchIndex(handle);

                return {
                    handle,
                    documentId,
                    fetchedName: fetched.name,
                    fetchedContent: fetched.content,
                    listedCount: listed.readItems.length,
                    listedNames: listed.readItems.map((d) => d.name),
                    countAfterDelete: listedAfterDelete.readItems.length,
                };
            },
            args,
        );

        expect(result.documentId).toBeDefined();
        expect(result.fetchedName).toBe("notes.txt");
        expect(result.fetchedContent).toBe("the quick brown fox");
        expect(result.listedCount).toBe(1);
        expect(result.listedNames).toContain("notes.txt");
        expect(result.countAfterDelete).toBe(0);
    });

    test("searchDocuments returns only documents matching the query", async ({
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
            indexMode: IndexMode,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, indexMode }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                // StoreApi, KvdbApi and LockApi are resolved from the
                // connection's container automatically.
                const searchApi = await Endpoint.createSearchApi(connection);

                const enc = new TextEncoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                const indexId = await searchApi.createSearchIndex(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("p"),
                    enc.encode("p"),
                    indexMode.WITH_CONTENT,
                );
                const handle = await searchApi.openSearchIndex(indexId);

                await searchApi.addDocument(handle, "fruit.txt", "apple banana cherry");
                await searchApi.addDocument(handle, "veg.txt", "carrot potato onion");

                const paging = { skip: 0, limit: 10, sortOrder: "desc" as const };
                const hits = await searchApi.searchDocuments(handle, "banana", paging);
                const misses = await searchApi.searchDocuments(handle, "zucchini", paging);
                const all = await searchApi.listDocuments(handle, paging);

                await searchApi.closeSearchIndex(handle);

                return {
                    hitNames: hits.readItems.map((d) => d.name),
                    missCount: misses.readItems.length,
                    totalCount: all.readItems.length,
                };
            },
            args,
        );

        expect(result.totalCount).toBe(2);
        expect(result.hitNames).toEqual(["fruit.txt"]);
        expect(result.missCount).toBe(0);
    });

    test("connection.getSearchApi() resolves the same cached instance as the factory", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            users,
        };

        const identities = await page.evaluate(async ({ bridgeUrl, solutionId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const searchApi = await connection.getSearchApi();

            return {
                sameAsFactory: searchApi === (await Endpoint.createSearchApi(connection)),
                stableAcrossCalls: searchApi === (await connection.getSearchApi()),
                // The dependencies SearchApi pulled from the container are the
                // same instances the caller resolves directly.
                sharesStoreApi:
                    (await Endpoint.createStoreApi(connection)) ===
                    (await connection.getStoreApi()),
                sharesLockApi:
                    (await Endpoint.createLockApi(connection)) === (await connection.getLockApi()),
            };
        }, args);

        expect(identities.sameAsFactory).toBe(true);
        expect(identities.stableAcrossCalls).toBe(true);
        expect(identities.sharesStoreApi).toBe(true);
        expect(identities.sharesLockApi).toBe(true);
    });
});
