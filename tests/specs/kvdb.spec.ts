import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../dist";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

test.describe("KvdbTest", () => {
    // --- Helper: Generate User 2 and add to Context ---
    async function setupUsers(page: any, cli: any) {
        const user2Keys = await page.evaluate(async () => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const privKey = await cryptoApi.generatePrivateKey();
            return {
                privKey: privKey,
                pubKey: await cryptoApi.derivePublicKey(privKey),
            };
        });

        const user2Id = `user2-${Date.now()}`;
        // Add User 2 to Context via CLI so they can exist in the solution
        await cli.call("context/addUserToContext", {
            contextId: testData.contextId,
            userId: user2Id,
            userPubKey: user2Keys.pubKey,
        });

        return {
            u1: { privKey: testData.userPrivKey, id: testData.userId, pubKey: testData.userPubKey },
            u2: { privKey: user2Keys.privKey, id: user2Id, pubKey: user2Keys.pubKey },
        };
    }

    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
        await page.evaluate(async () => {
            await window.Endpoint.setup("../../dist/assets");
        });
    });

    // =========================================================================
    // KVDB CRUD
    // =========================================================================

    test("Getting kvdb with valid/invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Setup
            const kId = await kvdbApi.createKvdb(
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

            // Invalid ID
            await expectError(async () => await kvdbApi.getKvdb("invalid_id"));

            // Valid ID
            const kvdb = await kvdbApi.getKvdb(kId);
            return { kvdb, kId };
        }, args);

        expect(result.kvdb.kvdbId).toEqual(result.kId);
    });

    test("Listing kvdbs with invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(
                async () =>
                    await kvdbApi.listKvdbs("invalid", { skip: 0, limit: 1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await kvdbApi.listKvdbs(contextId, { skip: 0, limit: -1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await kvdbApi.listKvdbs(contextId, { skip: 0, limit: 0, sortOrder: "desc" }),
            );
            // @ts-ignore
            await expectError(
                async () =>
                    await kvdbApi.listKvdbs(contextId, { skip: 0, limit: 1, sortOrder: "invalid" }),
            );
            // @ts-ignore
            await expectError(
                async () =>
                    await kvdbApi.listKvdbs(contextId, {
                        skip: 0,
                        limit: 1,
                        sortOrder: "desc",
                        lastId: "invalid",
                    }),
            );
        }, args);
    });

    test("Listing kvdbs with valid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const ids = [];
            for (let i = 0; i < 3; i++) {
                ids.push(
                    await kvdbApi.createKvdb(
                        contextId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode(`p${i}`),
                        enc.encode(`p${i}`),
                    ),
                );
            }

            const list1 = await kvdbApi.listKvdbs(contextId, {
                skip: 4,
                limit: 1,
                sortOrder: "desc",
            });
            const list2 = await kvdbApi.listKvdbs(contextId, {
                skip: 0,
                limit: 1,
                sortOrder: "desc",
            });
            const list3 = await kvdbApi.listKvdbs(contextId, {
                skip: 1,
                limit: 3,
                sortOrder: "asc",
            });

            return { list1, list2, list3, ids };
        }, args);

        expect(result.list1.readItems).toHaveLength(0);
        expect(result.list2.readItems).toHaveLength(1);
        expect(result.list2.readItems[0].kvdbId).toEqual(result.ids[2]); // Last created
        expect(result.list3.readItems.length).toBeGreaterThanOrEqual(2);
    });

    test("Creating kvdb with valid/invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(
                async () =>
                    await kvdbApi.createKvdb(
                        "invalid",
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );
            // Mismatch user key
            await expectError(
                async () =>
                    await kvdbApi.createKvdb(
                        contextId,
                        [{ userId: users.u1.id, pubKey: users.u2.pubKey }],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );
            // Mismatch manager key
            await expectError(
                async () =>
                    await kvdbApi.createKvdb(
                        contextId,
                        [u1Obj],
                        [{ userId: users.u1.id, pubKey: users.u2.pubKey }],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );
            // No managers
            await expectError(
                async () =>
                    await kvdbApi.createKvdb(
                        contextId,
                        [u1Obj],
                        [],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );

            // Create Diff
            const k1 = await kvdbApi.createKvdb(
                contextId,
                [u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const kvdb1 = await kvdbApi.getKvdb(k1);

            // Create Same
            const k2 = await kvdbApi.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const kvdb2 = await kvdbApi.getKvdb(k2);

            return { kvdb1, kvdb2 };
        }, args);

        expect(result.kvdb1.users[0]).toEqual(users.u2.id);
        expect(result.kvdb1.managers[0]).toEqual(users.u1.id);
        expect(result.kvdb2.users[0]).toEqual(users.u1.id);
    });

    test("Updating kvdb with invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const kId = await kvdbApi.createKvdb(
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

            await expectError(
                async () =>
                    await kvdbApi.updateKvdb(
                        "invalid",
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        1,
                        false,
                        false,
                    ),
            );
            await expectError(
                async () =>
                    await kvdbApi.updateKvdb(
                        kId,
                        [{ userId: u1Obj.userId, pubKey: u2Obj.pubKey }],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        1,
                        false,
                        false,
                    ),
            );
            await expectError(
                async () =>
                    await kvdbApi.updateKvdb(
                        kId,
                        [u1Obj],
                        [{ userId: u1Obj.userId, pubKey: u2Obj.pubKey }],
                        enc.encode("p"),
                        enc.encode("p"),
                        1,
                        false,
                        false,
                    ),
            );
            await expectError(
                async () =>
                    await kvdbApi.updateKvdb(
                        kId,
                        [u1Obj],
                        [],
                        enc.encode("p"),
                        enc.encode("p"),
                        1,
                        false,
                        false,
                    ),
            );
            await expectError(
                async () =>
                    await kvdbApi.updateKvdb(
                        kId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        99,
                        false,
                        false,
                    ),
            );
        }, args);
    });

    test("Updating kvdb with new users", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const kId = await kvdbApi.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            await kvdbApi.updateKvdb(
                kId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                1,
                false,
                false,
            );
            return { kvdb: await kvdbApi.getKvdb(kId) };
        }, args);

        expect(result.kvdb.version).toBe(2);
        expect(result.kvdb.users).toHaveLength(2);
    });

    test("Updating kvdb with new managers", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const kId = await kvdbApi.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            await kvdbApi.updateKvdb(
                kId,
                [u1Obj],
                [u1Obj, u2Obj],
                enc.encode("p"),
                enc.encode("p"),
                1,
                false,
                false,
            );
            return { kvdb: await kvdbApi.getKvdb(kId) };
        }, args);

        expect(result.kvdb.managers).toHaveLength(2);
    });

    test("Updating kvdb with less user", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const kId = await kvdbApi.createKvdb(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj, u2Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            await kvdbApi.updateKvdb(
                kId,
                [u1Obj],
                [u1Obj, u2Obj],
                enc.encode("p"),
                enc.encode("p"),
                1,
                false,
                false,
            );
            return { kvdb: await kvdbApi.getKvdb(kId) };
        }, args);

        expect(result.kvdb.users).toHaveLength(1);
        expect(result.kvdb.managers).toHaveLength(2); // Managers kept
    });

    test("Updating kvdb with less managers", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const kId = await kvdbApi.createKvdb(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj, u2Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            await kvdbApi.updateKvdb(
                kId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                1,
                false,
                false,
            );
            return { kvdb: await kvdbApi.getKvdb(kId) };
        }, args);

        expect(result.kvdb.managers).toHaveLength(1);
    });

    test("Force updating kvdb with incorrect version", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const kId = await kvdbApi.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // Force update with version 99
            await kvdbApi.updateKvdb(
                kId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                99,
                true,
                false,
            );
            return { kvdb: await kvdbApi.getKvdb(kId) };
        }, args);

        expect(result.kvdb.version).toBe(2);
    });

    test("Deleting kvdb with valid/invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createKvdbApi(conn1);

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createKvdbApi(conn2);

            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const kId = await api1.createKvdb(
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

            await expectError(async () => await api1.deleteKvdb("invalid"));

            // Unauthorized delete (User 2)
            await expectError(async () => await api2.deleteKvdb(kId));

            // Valid Delete
            await api1.deleteKvdb(kId);
            await expectError(async () => await api1.getKvdb(kId));
        }, args);
    });

    // =========================================================================
    // ENTRIES
    // =========================================================================

    test("Getting entry with valid/invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const kId = await kvdbApi.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            await kvdbApi.setEntry(
                kId,
                "key1",
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("d"),
                0,
            );

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };
            await expectError(async () => await kvdbApi.getEntry(kId, "invalid"));

            // Force key gen on KVDB
            await kvdbApi.updateKvdb(
                kId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                1,
                false,
                true,
            );

            const entry = await kvdbApi.getEntry(kId, "key1");
            return { entry };
        }, args);

        expect(result.entry.info.key).toEqual("key1");
    });

    test("Listing entries keys with invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(
                async () =>
                    await kvdbApi.listEntriesKeys("invalid", {
                        skip: 0,
                        limit: 1,
                        sortOrder: "desc",
                    }),
            );
            await expectError(
                async () =>
                    await kvdbApi.listEntriesKeys(contextId, {
                        skip: 0,
                        limit: -1,
                        sortOrder: "desc",
                    }),
            ); // Using ctx ID as placeholder
            await expectError(
                async () =>
                    await kvdbApi.listEntriesKeys(contextId, {
                        skip: 0,
                        limit: 0,
                        sortOrder: "desc",
                    }),
            );
            // @ts-ignore
            await expectError(
                async () =>
                    await kvdbApi.listEntriesKeys(contextId, {
                        skip: 0,
                        limit: 1,
                        sortOrder: "invalid",
                    }),
            );
        }, args);
    });

    test("Listing entries keys with valid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const kId = await kvdbApi.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            await kvdbApi.setEntry(kId, "k1", enc.encode("p"), enc.encode("p"), enc.encode("d"), 0);
            await kvdbApi.setEntry(kId, "k2", enc.encode("p"), enc.encode("p"), enc.encode("d"), 0);

            const list1 = await kvdbApi.listEntriesKeys(kId, {
                skip: 4,
                limit: 1,
                sortOrder: "desc",
            });
            const list2 = await kvdbApi.listEntriesKeys(kId, {
                skip: 1,
                limit: 1,
                sortOrder: "desc",
            });
            const list3 = await kvdbApi.listEntriesKeys(kId, {
                skip: 0,
                limit: 3,
                sortOrder: "asc",
            });

            return { list1, list2, list3 };
        }, args);

        expect(result.list1.readItems).toHaveLength(0);
        expect(result.list2.readItems).toHaveLength(1);
        expect(result.list2.readItems[0]).toEqual("k1"); // Descending k2, k1 -> skip 1 -> k1
        expect(result.list3.readItems).toHaveLength(2);
    });

    test("Listing entries with invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(
                async () =>
                    await kvdbApi.listEntries("invalid", { skip: 0, limit: 1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await kvdbApi.listEntries(contextId, { skip: 0, limit: -1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await kvdbApi.listEntries(contextId, { skip: 0, limit: 0, sortOrder: "desc" }),
            );
            // @ts-ignore
            await expectError(
                async () =>
                    await kvdbApi.listEntries(contextId, {
                        skip: 0,
                        limit: 1,
                        sortOrder: "invalid",
                    }),
            );
        }, args);
    });

    test("Listing entries with valid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const kId = await kvdbApi.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            await kvdbApi.setEntry(kId, "k1", enc.encode("p"), enc.encode("p"), enc.encode("d"), 0);
            await kvdbApi.setEntry(kId, "k2", enc.encode("p"), enc.encode("p"), enc.encode("d"), 0);

            const list1 = await kvdbApi.listEntries(kId, { skip: 4, limit: 1, sortOrder: "desc" });
            const list2 = await kvdbApi.listEntries(kId, { skip: 1, limit: 1, sortOrder: "desc" });
            const list3 = await kvdbApi.listEntries(kId, { skip: 0, limit: 3, sortOrder: "asc" });

            return { list1, list2, list3 };
        }, args);

        expect(result.list1.readItems).toHaveLength(0);
        expect(result.list2.readItems).toHaveLength(1);
        expect(result.list2.readItems[0].info.key).toEqual("k1");
        expect(result.list3.readItems).toHaveLength(2);
    });

    test("Setting entry with valid/invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const kId = await kvdbApi.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const key = "k1";

            // Create (Version 0)
            await kvdbApi.setEntry(kId, key, enc.encode("p"), enc.encode("p"), enc.encode("d1"), 0);
            const e1 = await kvdbApi.getEntry(kId, key);

            // Invalid Version Update
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };
            await expectError(
                async () =>
                    await kvdbApi.setEntry(
                        kId,
                        key,
                        enc.encode("p"),
                        enc.encode("p"),
                        enc.encode("d2"),
                        0,
                    ),
            );

            // Valid Update
            await kvdbApi.setEntry(kId, key, enc.encode("p"), enc.encode("p"), enc.encode("d2"), 1);
            const e2 = await kvdbApi.getEntry(kId, key);

            // Access Denied Check (User 2)
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createKvdbApi(conn2);
            await expectError(
                async () =>
                    await api2.setEntry(
                        kId,
                        key,
                        enc.encode("p"),
                        enc.encode("p"),
                        enc.encode("fail"),
                        2,
                    ),
            );

            return { e1, e2 };
        }, args);

        expect(result.e1.version).toBe(1);
        expect(result.e2.version).toBe(2);
    });

    test("Deleting entry with valid/invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createKvdbApi(conn1);

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createKvdbApi(conn2);

            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const kId = await api1.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            await api1.setEntry(kId, "k1", enc.encode("p"), enc.encode("p"), enc.encode("d"), 0);

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // Invalid Key
            await expectError(async () => await api1.deleteEntry(kId, "invalid"));

            // Unauthorized Delete (User 2)
            await expectError(async () => await api2.deleteEntry(kId, "k1"));

            // Valid Delete (User 1)
            await api1.deleteEntry(kId, "k1");
        }, args);
    });

    test("Deleting entries with valid/invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const kvdbApi = await Endpoint.createKvdbApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const kId = await kvdbApi.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            await kvdbApi.setEntry(kId, "k1", enc.encode("p"), enc.encode("p"), enc.encode("d"), 0);
            await kvdbApi.setEntry(kId, "k2", enc.encode("p"), enc.encode("p"), enc.encode("d"), 0);

            // Empty delete
            await kvdbApi.deleteEntries(kId, []);

            // Batch delete
            const res = await kvdbApi.deleteEntries(kId, ["invalid", "k1", "k2"]);

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };
            await expectError(async () => await kvdbApi.getEntry(kId, "k1"));

            return { res };
        }, args);

        expect(result.res["invalid"]).toBe(false);
        expect(result.res["k1"]).toBe(true);
        expect(result.res["k2"]).toBe(true);
    });

    test("Trying to accessing unavailable data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createKvdbApi(conn1);

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createKvdbApi(conn2);

            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const kId = await api1.createKvdb(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            await api1.setEntry(kId, "k1", enc.encode("p"), enc.encode("p"), enc.encode("d"), 0);

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(async () => await api2.getKvdb(kId));
            await expectError(
                async () =>
                    await api2.updateKvdb(
                        kId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        1,
                        true,
                        false,
                    ),
            );
            await expectError(async () => await api2.deleteKvdb(kId));
            await expectError(async () => await api2.getEntry(kId, "k1"));
            await expectError(
                async () => await api2.listEntries(kId, { skip: 0, limit: 1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await api2.setEntry(
                        kId,
                        "k1",
                        enc.encode("p"),
                        enc.encode("p"),
                        enc.encode("d"),
                        1,
                    ),
            );
            await expectError(async () => await api2.deleteEntry(kId, "k1"));
        }, args);
    });

    test.fixme("Trying to accessing data using publicAccount", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createKvdbApi(conn1);
            const kId = await api1.createKvdb(
                contextId,
                [{ userId: users.u1.id, pubKey: users.u1.pubKey }],
                [{ userId: users.u1.id, pubKey: users.u1.pubKey }],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );
            await api1.setEntry(
                kId,
                "k1",
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
                new TextEncoder().encode("d"),
                0,
            );

            const connPub = await Endpoint.connectPublic(solutionId, bridgeUrl);
            const apiPub = await Endpoint.createKvdbApi(connPub);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(async () => await apiPub.getKvdb(kId));
            await expectError(
                async () =>
                    await apiPub.listKvdbs(contextId, { skip: 0, limit: 1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await apiPub.createKvdb(
                        contextId,
                        [],
                        [],
                        new Uint8Array(0),
                        new Uint8Array(0),
                    ),
            );
            await expectError(async () => await apiPub.getEntry(kId, "k1"));
        }, args);
    });

    test("Creating kvdb with owner only policy", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createKvdbApi(conn1);
            const enc = new TextEncoder();
            const usersArr = [
                { userId: users.u1.id, pubKey: users.u1.pubKey },
                { userId: users.u2.id, pubKey: users.u2.pubKey },
            ];

            const policy = {
                item: {
                    get: "owner",
                    listMy: "owner",
                    listAll: "owner",
                    create: "owner",
                    update: "owner",
                    delete_: "owner",
                },
                get: "owner",
                update: "owner",
                delete_: "owner",
                updatePolicy: "owner",
                updaterCanBeRemovedFromManagers: "no",
                ownerCanBeRemovedFromManagers: "no",
            };

            const kId = await api1.createKvdb(
                contextId,
                usersArr,
                usersArr,
                enc.encode("p"),
                enc.encode("p"),
                policy,
            );

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createKvdbApi(conn2);

            // User 2 (Listed but restricted by policy)
            let u2Access = false;
            try {
                await api2.getKvdb(kId);
                u2Access = true;
            } catch {}

            return { policy, u2Access };
        }, args);

        expect(result.u2Access).toBe(false);
    });

    test("Updating kvdb with owner only policy", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createKvdbApi(conn1);
            const enc = new TextEncoder();
            const usersArr = [
                { userId: users.u1.id, pubKey: users.u1.pubKey },
                { userId: users.u2.id, pubKey: users.u2.pubKey },
            ];

            // Create
            const kId = await api1.createKvdb(
                contextId,
                [{ userId: users.u1.id, pubKey: users.u1.pubKey }],
                [{ userId: users.u1.id, pubKey: users.u1.pubKey }],
                enc.encode("p"),
                enc.encode("p"),
            );

            const policy = {
                item: {
                    get: "owner",
                    listMy: "owner",
                    listAll: "owner",
                    create: "owner",
                    update: "owner",
                    delete_: "owner",
                },
                get: "owner",
                update: "owner",
                delete_: "owner",
                updatePolicy: "owner",
                updaterCanBeRemovedFromManagers: "no",
                ownerCanBeRemovedFromManagers: "no",
            };

            // Update Policy
            await api1.updateKvdb(
                kId,
                usersArr,
                usersArr,
                enc.encode("p"),
                enc.encode("p"),
                1,
                true,
                true,
                policy,
            );

            // Check User 2
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createKvdbApi(conn2);
            let u2Access = false;
            try {
                await api2.getKvdb(kId);
                u2Access = true;
            } catch {}

            return { u2Access };
        }, args);

        expect(result.u2Access).toBe(false);
    });
});
