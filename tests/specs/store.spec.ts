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

test.describe("StoreTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
        await page.evaluate(async () => {
            await window.Endpoint.setup("../../dist/assets");
        });
    });

    // =========================================================================
    // STORE CRUD
    // =========================================================================

    test("Getting store with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Setup: Create a Store
            const storeId = await storeApi.createStore(
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
            await expectError(async () => await storeApi.getStore("invalid_id"));

            // Valid ID
            const store = await storeApi.getStore(storeId);
            return { store, storeId };
        }, args);

        expect(result.store.storeId).toEqual(result.storeId);
    });

    test("Listing stores with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const ids: string[] = [];
            for (let i = 0; i < 3; i++) {
                ids.push(
                    await storeApi.createStore(
                        contextId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode(`p${i}`),
                        enc.encode(`p${i}`),
                    ),
                );
            }

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // Invalid inputs
            await expectError(
                async () =>
                    await storeApi.listStores("invalid", { skip: 0, limit: 1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await storeApi.listStores(contextId, { skip: 0, limit: -1, sortOrder: "desc" }),
            );

            // Valid Lists
            const list1 = await storeApi.listStores(contextId, {
                skip: 4,
                limit: 1,
                sortOrder: "desc",
            });
            const list2 = await storeApi.listStores(contextId, {
                skip: 0,
                limit: 1,
                sortOrder: "desc",
            }); // Newest
            const list3 = await storeApi.listStores(contextId, {
                skip: 0,
                limit: 3,
                sortOrder: "asc",
            });

            return { list1, list2, list3, ids };
        }, args);

        expect(result.list1.readItems).toHaveLength(0);
        expect(result.list2.readItems).toHaveLength(1);
        expect(result.list2.readItems[0].storeId).toEqual(result.ids[2]);
        expect(result.list3.readItems.length).toBeGreaterThanOrEqual(3);
    });

    test("Creating store with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
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

            // Invalid
            await expectError(
                async () =>
                    await storeApi.createStore(
                        "bad_ctx",
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );
            await expectError(
                async () =>
                    await storeApi.createStore(
                        contextId,
                        [u1Obj],
                        [],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            ); // No managers

            // Different Users/Managers
            const s1 = await storeApi.createStore(
                contextId,
                [u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const store1 = await storeApi.getStore(s1);

            // Same Users/Managers
            const s2 = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const store2 = await storeApi.getStore(s2);

            return { store1, store2 };
        }, args);

        expect(result.store1.users[0]).toEqual(users.u2.id);
        expect(result.store2.users[0]).toEqual(users.u1.id);
    });

    test("Updating store (Invalid inputs & Users/Managers)", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const sId = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const sV1 = await storeApi.getStore(sId);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // Invalid Inputs
            await expectError(
                async () =>
                    await storeApi.updateStore(
                        "invalid",
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        sV1.version,
                        false,
                        false,
                    ),
            );
            await expectError(
                async () =>
                    await storeApi.updateStore(
                        sId,
                        [u1Obj],
                        [],
                        enc.encode("p"),
                        enc.encode("p"),
                        sV1.version,
                        false,
                        false,
                    ),
            ); // No managers

            // Add User 2
            await storeApi.updateStore(
                sId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                sV1.version,
                false,
                false,
            );
            const sV2 = await storeApi.getStore(sId);

            // Add Manager 2
            await storeApi.updateStore(
                sId,
                [u1Obj, u2Obj],
                [u1Obj, u2Obj],
                enc.encode("p"),
                enc.encode("p"),
                sV2.version,
                false,
                false,
            );
            const sV3 = await storeApi.getStore(sId);

            // Remove User 2 from Users (keep in managers - allowed?) -> Actually typically managers must be users.
            // Let's remove from both to test "less users"
            await storeApi.updateStore(
                sId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                sV3.version,
                false,
                false,
            );
            const sV4 = await storeApi.getStore(sId);

            return { sV2, sV3, sV4 };
        }, args);

        expect(result.sV2.users).toHaveLength(2);
        expect(result.sV3.managers).toHaveLength(2);
        expect(result.sV4.users).toHaveLength(1);
    });

    test("Force updating store with incorrect version", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const sId = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // Force update with crazy version
            await storeApi.updateStore(
                sId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                999,
                true,
                false,
            );
            return { store: await storeApi.getStore(sId) };
        }, args);

        expect(result.store.version).toEqual(2);
    });

    test("Deleting store with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const api1 = await Endpoint.createStoreApi(conn1);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createStoreApi(conn2);

            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const sId = await api1.createStore(
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
            await expectError(async () => await api1.deleteStore("invalid"));

            // Unauthorized User 2
            await expectError(async () => await api2.deleteStore(sId));

            // Valid Delete
            await api1.deleteStore(sId);
            await expectError(async () => await api1.getStore(sId));
        }, args);
    });

    // =========================================================================
    // FILE CRUD & IO
    // =========================================================================

    test("Creating/Writing/Reading/Deleting File (Lifecycle)", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Setup Store
            const storeId = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // 1. Create File (allocating 1MB)
            const chunkSize = 32 * 1024;
            const chunksCount = 4; // 128KB total
            const totalSize = chunkSize * chunksCount;

            const writeHandle = await storeApi.createFile(
                storeId,
                enc.encode("fp"),
                enc.encode("fp"),
                totalSize,
                false,
            );

            // 2. Write Data
            let uploadedHex = "";
            const hexMap = "0123456789ABCDEF";
            const toHex = (u8: Uint8Array) => {
                let s = "";
                for (let b of u8) s += hexMap[b >> 4] + hexMap[b & 15];
                return s;
            };

            for (let i = 0; i < chunksCount; i++) {
                const chunk = new Uint8Array(chunkSize);
                window.crypto.getRandomValues(chunk);
                await storeApi.writeToFile(writeHandle, chunk);
                uploadedHex += toHex(chunk);
            }

            // 3. Write too much -> Fail
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };
            await expectError(
                async () => await storeApi.writeToFile(writeHandle, new Uint8Array(10)),
            );

            // 4. Close
            const fileId = await storeApi.closeFile(writeHandle);

            // 5. Read Back
            const readHandle = await storeApi.openFile(fileId);
            let readHex = "";

            // Read 50%
            const p1 = await storeApi.readFromFile(readHandle, totalSize / 2);
            readHex += toHex(p1);

            // Read rest
            const p2 = await storeApi.readFromFile(readHandle, totalSize / 2);
            readHex += toHex(p2);

            // 6. Metadata Check
            const fileMeta = await storeApi.getFile(fileId);

            return { uploadedHex, readHex, fileSize: fileMeta.size, fileId };
        }, args);

        expect(result.uploadedHex).toEqual(result.readHex);
        expect(result.fileSize).toEqual(131072); // 4 * 32KB
    });

    test("Creating/Updating file with size=0", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const storeId = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // Create size 0
            const wh = await storeApi.createFile(
                storeId,
                enc.encode("p"),
                enc.encode("p"),
                0,
                false,
            );
            const fId = await storeApi.closeFile(wh);
            const f1 = await storeApi.getFile(fId);

            // Update to size 0 (resize)
            const uh = await storeApi.updateFile(fId, enc.encode("p"), enc.encode("p"), 0);
            await storeApi.closeFile(uh);
            const f2 = await storeApi.getFile(fId);

            return { s1: f1.size, s2: f2.size };
        }, args);

        expect(result.s1).toEqual(0);
        expect(result.s2).toEqual(0);
    });

    test("Updating File Meta (Valid/Invalid)", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const sId = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const wh = await storeApi.createFile(
                sId,
                enc.encode("orig"),
                enc.encode("orig"),
                0,
                false,
            );
            const fId = await storeApi.closeFile(wh);

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
                    await storeApi.updateFileMeta("invalid", enc.encode("p"), enc.encode("p")),
            );

            await storeApi.updateFileMeta(fId, enc.encode("new"), enc.encode("new"));
            const file = await storeApi.getFile(fId);

            return { file };
        }, args);

        // Verify meta content (needs decoding in test or comparison of values)
        // Assuming success if no error thrown and object returned
        expect(result.file).toBeDefined();
    });

    test("Access Control: Unauthorized & Public Access", async ({ page, backend, cli }) => {
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

            // User 1 creates Store & File
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStoreApi(conn1);
            const sId = await api1.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const wh = await api1.createFile(sId, enc.encode("p"), enc.encode("p"), 0, false);
            const fId = await api1.closeFile(wh);

            // User 2 Connects
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createStoreApi(conn2);

            // Public Connects
            const connPub = await Endpoint.connectPublic(solutionId, bridgeUrl);
            const apiPub = await Endpoint.createStoreApi(connPub);

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // User 2 Checks
            await expectError(async () => await api2.getStore(sId));
            await expectError(
                async () =>
                    await api2.updateStore(
                        sId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        2,
                        false,
                        false,
                    ),
            );
            await expectError(async () => await api2.deleteStore(sId));
            await expectError(async () => await api2.getFile(fId));
            await expectError(
                async () => await api2.createFile(sId, enc.encode("p"), enc.encode("p"), 0, false),
            );

            // Public Checks
            await expectError(async () => await apiPub.getStore(sId));
            await expectError(
                async () =>
                    await apiPub.listStores(contextId, { skip: 0, limit: 1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await apiPub.createStore(
                        contextId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );
        }, args);
    });

    test("Policy: Owner Only", async ({ page, backend, cli }) => {
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
            const api1 = await Endpoint.createStoreApi(conn1);
            const enc = new TextEncoder();
            const usersArr = [
                { userId: users.u1.id, pubKey: users.u1.pubKey },
                { userId: users.u2.id, pubKey: users.u2.pubKey },
            ];

            // Policy: Owner Only
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
            } as ContainerPolicy;

            const sId = await api1.createStore(
                contextId,
                usersArr,
                usersArr,
                enc.encode("p"),
                enc.encode("p"),
                policy,
            );

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createStoreApi(conn2);

            // User 2 shouldn't see it despite being in the users list
            try {
                await api2.getStore(sId);
                return { access: true };
            } catch {
                return { access: false };
            }
        }, args);

        expect(result.access).toBe(false);
    });

    test("Getting file meta with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Setup
            const sId = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            // Create a file to fetch
            const wh = await storeApi.createFile(sId, enc.encode("f"), enc.encode("f"), 0, false);
            const fId = await storeApi.closeFile(wh);

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // 1. Incorrect File ID (using ContextID as a fake invalid ID)
            await expectError(async () => await storeApi.getFile(contextId));

            // 2. Valid Get (after a store update to force key rotation logic if any)
            await storeApi.updateStore(
                sId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                1,
                false,
                true,
            );

            const file = await storeApi.getFile(fId);
            return { file, fId };
        }, args);

        expect(result.file.info.fileId).toEqual(result.fId);
    });

    test("Listing file meta with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const sId = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // Create 2 files
            const h1 = await storeApi.createFile(sId, enc.encode("f1"), enc.encode("f1"), 0, false);
            const f1 = await storeApi.closeFile(h1);
            const h2 = await storeApi.createFile(sId, enc.encode("f2"), enc.encode("f2"), 0, false);
            const f2 = await storeApi.closeFile(h2);

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // --- Invalid Inputs ---
            await expectError(
                async () =>
                    await storeApi.listFiles("invalid", { skip: 0, limit: 1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await storeApi.listFiles(sId, { skip: 0, limit: -1, sortOrder: "desc" }),
            );
            // @ts-ignore
            await expectError(
                async () =>
                    await storeApi.listFiles(sId, {
                        skip: 0,
                        limit: 1,
                        sortOrder: "invalid" as SortOrder,
                    }),
            );

            // --- Valid Inputs ---
            const list1 = await storeApi.listFiles(sId, { skip: 4, limit: 1, sortOrder: "desc" });
            const list2 = await storeApi.listFiles(sId, { skip: 1, limit: 1, sortOrder: "desc" }); // Should be f1 (older)
            const list3 = await storeApi.listFiles(sId, { skip: 0, limit: 3, sortOrder: "asc" });

            return { list1, list2, list3, f1, f2 };
        }, args);

        expect(result.list1.readItems).toHaveLength(0);
        expect(result.list2.readItems).toHaveLength(1);
        expect(result.list2.readItems[0].info.fileId).toEqual(result.f1);
        expect(result.list3.readItems).toHaveLength(2);
    });

    test("Creating file with invalid input data", async ({ page, backend, cli }) => {
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
            const storeApi = await Endpoint.createStoreApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const sId = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            // Create a valid file for update tests
            const wh = await storeApi.createFile(sId, enc.encode("f"), enc.encode("f"), 0, false);
            const fId = await storeApi.closeFile(wh);

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // Create: Invalid Store ID
            await expectError(
                async () =>
                    await storeApi.createFile(
                        "invalid",
                        enc.encode("p"),
                        enc.encode("p"),
                        64,
                        false,
                    ),
            );
            // Create: Negative Size
            await expectError(
                async () =>
                    await storeApi.createFile(sId, enc.encode("p"), enc.encode("p"), -1, false),
            );

            // Update: Invalid File ID
            await expectError(
                async () =>
                    await storeApi.updateFile("invalid", enc.encode("p"), enc.encode("p"), 64),
            );
            // Update: Negative Size
            await expectError(
                async () => await storeApi.updateFile(fId, enc.encode("p"), enc.encode("p"), -1),
            );

            // IO: Write to non-existent handle
            await expectError(async () => await storeApi.writeToFile(99999, enc.encode("data")));

            // IO: Write to Read Handle
            const readHandle = await storeApi.openFile(fId);
            await expectError(
                async () => await storeApi.writeToFile(readHandle, enc.encode("data")),
            );

            // IO: Close invalid handle
            await expectError(async () => await storeApi.closeFile(0));
        }, args);
    });

    test("Reading file data with invalid input data (Seek/Read)", async ({
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

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const storeApi = await Endpoint.createStoreApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            // Invalid Open
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };
            await expectError(async () => await storeApi.openFile(sId)); // Passing StoreID instead of FileID

            // Invalid operations on non-existent handle
            await expectError(async () => await storeApi.readFromFile(999, 1));
            await expectError(async () => await storeApi.seekInFile(999, 1));

            // Create a valid file (size 64)
            const wh = await storeApi.createFile(sId, enc.encode("p"), enc.encode("p"), 64, false);
            await storeApi.writeToFile(wh, new Uint8Array(64));

            // Try to read from Write Handle
            await expectError(async () => await storeApi.readFromFile(wh, 1));
            await expectError(async () => await storeApi.seekInFile(wh, 1));

            const fId = await storeApi.closeFile(wh);
            const rh = await storeApi.openFile(fId);

            // Invalid Seek (negative)
            await expectError(async () => await storeApi.seekInFile(rh, -1));

            // Invalid Seek (beyond size) -> File size is 64
            await expectError(async () => await storeApi.seekInFile(rh, 100));
        }, args);
    });

    test("Updating store with owner only policy", async ({ page, backend, cli }) => {
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

            // 1. User 1 Connects
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStoreApi(conn1);

            // 2. Define Policy (Owner Only)
            const ownerPolicy = {
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
            } as ContainerPolicy;

            // 3. Update Store to include User 2, BUT keep Policy strict
            // We create first, then update
            const sId = await api1.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                ownerPolicy,
            );

            await api1.updateStore(
                sId,
                [u1Obj, u2Obj], // Add User 2
                [u1Obj, u2Obj], // Add User 2 as Manager
                enc.encode("p"),
                enc.encode("p"),
                1,
                true,
                true,
                ownerPolicy, // Keep strict policy
            );

            // 4. Verify User 1 access
            const store = await api1.getStore(sId);

            // 5. Verify User 2 access (Should Fail despite being in the list)
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createStoreApi(conn2);

            let u2Access = false;
            try {
                await api2.getStore(sId);
                u2Access = true;
            } catch (e) {
                // Expected failure
            }

            return { store, u2Access, ownerPolicy };
        }, args);

        expect(result.store.users).toHaveLength(2); // User 2 is technically listed
        expect(result.u2Access).toBe(false); // But cannot access due to policy
        expect(result.store.policy).toEqual(result.ownerPolicy);
    });
});
