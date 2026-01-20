import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { setupUsers } from "../test-utils";
import { ContainerPolicy, SortOrder } from "../../src/Types";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

test.describe("InboxTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
        await page.evaluate(async () => {
            await window.Endpoint.setup("../../assets");
        });
    });

    // =========================================================================
    // INBOX CRUD
    // =========================================================================

    test("Getting inbox with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const storeApi = await Endpoint.createStoreApi(connection);
            const inboxApi = await Endpoint.createInboxApi(connection, threadApi, storeApi);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Setup
            const inboxId = await inboxApi.createInbox(
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

            // Invalid ID (using ContextID as placeholder for invalid)
            await expectError(async () => await inboxApi.getInbox(contextId));

            // Valid ID
            const inbox = await inboxApi.getInbox(inboxId);
            return { inbox, inboxId };
        }, args);

        expect(result.inbox.inboxId).toEqual(result.inboxId);
    });

    test("Listing inboxes with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const storeApi = await Endpoint.createStoreApi(connection);
            const inboxApi = await Endpoint.createInboxApi(connection, threadApi, storeApi);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Create 3 inboxes
            const ids: string[] = [];
            for (let i = 0; i < 3; i++) {
                ids.push(
                    await inboxApi.createInbox(
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

            // --- Invalid ---
            await expectError(
                async () =>
                    await inboxApi.listInboxes("invalid", { skip: 0, limit: 1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await inboxApi.listInboxes(contextId, {
                        skip: 0,
                        limit: -1,
                        sortOrder: "desc",
                    }),
            );
            // @ts-ignore
            await expectError(
                async () =>
                    await inboxApi.listInboxes(contextId, {
                        skip: 0,
                        limit: 1,
                        sortOrder: "invalid" as SortOrder,
                    }),
            );

            // --- Valid ---
            const list1 = await inboxApi.listInboxes(contextId, {
                skip: 4,
                limit: 1,
                sortOrder: "desc",
            });
            const list2 = await inboxApi.listInboxes(contextId, {
                skip: 0,
                limit: 1,
                sortOrder: "desc",
            });
            const list3 = await inboxApi.listInboxes(contextId, {
                skip: 1,
                limit: 3,
                sortOrder: "asc",
            });

            return { list1, list2, list3, ids };
        }, args);

        expect(result.list1.readItems).toHaveLength(0);
        expect(result.list2.readItems).toHaveLength(1);
        expect(result.list2.readItems[0].inboxId).toEqual(result.ids[2]);
        expect(result.list3.readItems.length).toBeGreaterThanOrEqual(2);
    });

    test("Creating inbox with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const storeApi = await Endpoint.createStoreApi(connection);
            const inboxApi = await Endpoint.createInboxApi(connection, threadApi, storeApi);
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

            // Invalid Inputs
            await expectError(
                async () =>
                    await inboxApi.createInbox(
                        "invalid",
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );
            await expectError(
                async () =>
                    await inboxApi.createInbox(
                        contextId,
                        [{ userId: users.u1.id, pubKey: users.u2.pubKey }],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            ); // Mismatch
            await expectError(
                async () =>
                    await inboxApi.createInbox(
                        contextId,
                        [u1Obj],
                        [],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            ); // No managers

            // Valid: Diff users/managers
            const i1 = await inboxApi.createInbox(
                contextId,
                [u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const inbox1 = await inboxApi.getInbox(i1);

            // Valid: Same users
            const i2 = await inboxApi.createInbox(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const inbox2 = await inboxApi.getInbox(i2);

            return { inbox1, inbox2 };
        }, args);

        expect(result.inbox1.users[0]).toEqual(users.u2.id);
        expect(result.inbox1.managers[0]).toEqual(users.u1.id);
    });

    test("Updating inbox (Invalid inputs & Users/Managers)", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const storeApi = await Endpoint.createStoreApi(connection);
            const inboxApi = await Endpoint.createInboxApi(connection, threadApi, storeApi);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const iId = await inboxApi.createInbox(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const iV1 = await inboxApi.getInbox(iId);
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
                    await inboxApi.updateInbox(
                        "invalid",
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        undefined,
                        1,
                        false,
                        false,
                    ),
            );
            await expectError(
                async () =>
                    await inboxApi.updateInbox(
                        iId,
                        [u1Obj],
                        [],
                        enc.encode("p"),
                        enc.encode("p"),
                        undefined,
                        1,
                        false,
                        false,
                    ),
            );
            await expectError(
                async () =>
                    await inboxApi.updateInbox(
                        iId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        undefined,
                        99,
                        false,
                        false,
                    ),
            ); // Version

            // Add User 2
            await inboxApi.updateInbox(
                iId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                undefined,
                iV1.version,
                false,
                false,
            );
            const iV2 = await inboxApi.getInbox(iId);

            // Add Manager 2
            await inboxApi.updateInbox(
                iId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                undefined,
                iV2.version,
                false,
                false,
            ); // Removed U2 from users but kept as manager?
            // Note: In logic, updating managers implies updating access.
            // Let's do explicit Add Manager
            await inboxApi.updateInbox(
                iId,
                [u1Obj],
                [u1Obj, u2Obj],
                enc.encode("p"),
                enc.encode("p"),
                undefined,
                iV2.version + 1,
                false,
                false,
            );
            const iV3 = await inboxApi.getInbox(iId);

            return { iV2, iV3 };
        }, args);

        expect(result.iV2.users).toHaveLength(2);
        expect(result.iV3.managers).toHaveLength(2);
    });

    test("Force updating inbox", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const storeApi = await Endpoint.createStoreApi(connection);
            const inboxApi = await Endpoint.createInboxApi(connection, threadApi, storeApi);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const iId = await inboxApi.createInbox(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // Force Update (ver 99, force=true)
            await inboxApi.updateInbox(
                iId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                undefined,
                99,
                true,
                false,
            );
            return { inbox: await inboxApi.getInbox(iId) };
        }, args);

        expect(result.inbox.version).toBe(2);
    });

    test("Deleting inbox with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const threadApi1 = await Endpoint.createThreadApi(conn1);
            const storeApi1 = await Endpoint.createStoreApi(conn1);
            const api1 = await Endpoint.createInboxApi(conn1, threadApi1, storeApi1);

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const threadApi2 = await Endpoint.createThreadApi(conn2);
            const storeApi2 = await Endpoint.createStoreApi(conn2);
            const api2 = await Endpoint.createInboxApi(conn2, threadApi2, storeApi2);

            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const iId = await api1.createInbox(
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

            await expectError(async () => await api1.deleteInbox("invalid"));

            // Unauthorized delete (User 2)
            await expectError(async () => await api2.deleteInbox(iId));

            // Valid Delete
            await api1.deleteInbox(iId);
            await expectError(async () => await api1.getInbox(iId));
        }, args);
    });

    test("Getting inbox public data", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const storeApi = await Endpoint.createStoreApi(connection);
            const inboxApi = await Endpoint.createInboxApi(connection, threadApi, storeApi);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const iId = await inboxApi.createInbox(
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

            await expectError(async () => await inboxApi.getInboxPublicView("invalid"));

            const view = await inboxApi.getInboxPublicView(iId);
            return { view, iId };
        }, args);

        expect(result.view.inboxId).toEqual(result.iId);
        expect(result.view.version).toEqual(1);
    });

    // =========================================================================
    // ENTRIES (Sending, Reading, Listing, Deleting)
    // =========================================================================

    test("Entry Flow: Send (with chunks), Read, List", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const storeApi = await Endpoint.createStoreApi(connection);
            const inboxApi = await Endpoint.createInboxApi(connection, threadApi, storeApi);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const iId = await inboxApi.createInbox(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // --- SEND ENTRY (Chunked) ---
            const chunkSize = 32 * 1024;
            const chunks = 4;
            const fileSize = chunkSize * chunks;

            // 1. Create File Handles (Empty and With Data)
            const fh1 = await inboxApi.createFileHandle(enc.encode("pub1"), enc.encode("priv1"), 0);
            const fh2 = await inboxApi.createFileHandle(
                enc.encode("pub2"),
                enc.encode("priv2"),
                fileSize,
            );

            // 2. Prepare Entry
            const inboxHandle = await inboxApi.prepareEntry(
                iId,
                enc.encode("test_entry"),
                [fh1, fh2],
                users.u1.privKey,
            );

            // 3. Write Data
            let uploadedHex = "";
            const toHex = (u8: Uint8Array) => {
                let s = "";
                for (let b of u8) s += ("0" + b.toString(16)).slice(-2).toUpperCase();
                return s;
            };

            for (let i = 0; i < chunks; i++) {
                const chunk = new Uint8Array(chunkSize);
                window.crypto.getRandomValues(chunk);
                await inboxApi.writeToFile(inboxHandle, fh2, chunk);
                uploadedHex += toHex(chunk);
            }

            // 4. Send
            await inboxApi.sendEntry(inboxHandle);

            // --- LIST & READ ---
            const list = await inboxApi.listEntries(iId, { skip: 0, limit: 1, sortOrder: "asc" });
            const entryMeta = list.readItems[0];
            const fileMeta = entryMeta.files[1]; // The one with data

            // Read
            const readHandle = await inboxApi.openFile(fileMeta.info.fileId);
            let readHex = "";
            for (let i = 0; i < chunks; i++) {
                const chunk: Uint8Array = await inboxApi.readFromFile(readHandle, chunkSize);
                readHex += toHex(chunk);
            }

            // Invalid Inputs Check
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };
            await expectError(async () => await inboxApi.readEntry(contextId)); // Wrong ID
            await expectError(
                async () =>
                    await inboxApi.listEntries("invalid", { skip: 0, limit: 1, sortOrder: "desc" }),
            );

            return { entryMeta, uploadedHex, readHex };
        }, args);

        expect(result.uploadedHex).toEqual(result.readHex);
        expect(result.entryMeta.files).toHaveLength(2);
    });

    test("Sending entry as Public user", async ({ page, backend, cli }) => {
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

            // User 1 Creates Inbox
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const threadApi = await Endpoint.createThreadApi(conn1);
            const storeApi = await Endpoint.createStoreApi(conn1);
            const api1 = await Endpoint.createInboxApi(conn1, threadApi, storeApi);
            const iId = await api1.createInbox(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // Public User Sends
            const connPub = await Endpoint.connectPublic(solutionId, bridgeUrl);
            const threadApiPub = await Endpoint.createThreadApi(connPub);
            const storeApiPub = await Endpoint.createStoreApi(connPub);
            const apiPub = await Endpoint.createInboxApi(connPub, threadApiPub, storeApiPub);

            const fh = await apiPub.createFileHandle(enc.encode("p"), enc.encode("p"), 0);
            const h = await apiPub.prepareEntry(iId, enc.encode("pub_entry"), [fh]); // Encrypting for target (User1)
            await apiPub.sendEntry(h);

            // User 1 Verifies
            const list = await api1.listEntries(iId, { skip: 0, limit: 1, sortOrder: "desc" });
            return { count: list.totalAvailable };
        }, args);

        expect(result.count).toBe(1);
    });

    test("Deleting entry (Permissions)", async ({ page, backend, cli }) => {
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
            const api1 = await Endpoint.createInboxApi(
                conn1,
                await Endpoint.createThreadApi(conn1),
                await Endpoint.createStoreApi(conn1),
            );

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createInboxApi(
                conn2,
                await Endpoint.createThreadApi(conn2),
                await Endpoint.createStoreApi(conn2),
            );

            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Setup
            const iId = await api1.createInbox(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            // Send simple entry
            const fh = await api1.createFileHandle(enc.encode("p"), enc.encode("p"), 0);
            const h = await api1.prepareEntry(iId, enc.encode("e"), [fh], users.u1.privKey);
            await api1.sendEntry(h);

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            const entries = await api1.listEntries(iId, { limit: 1, skip: 0, sortOrder: "asc" });
            const entryId = entries.readItems[0].entryId;

            // User 2 cannot delete
            await expectError(async () => await api2.deleteEntry(entryId));

            // User 1 can delete
            await api1.deleteEntry(entryId);
        }, args);
    });

    // =========================================================================
    // PERMISSIONS & POLICIES
    // =========================================================================

    test("Access Control: Unauthorized & Public", async ({ page, backend, cli }) => {
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

            // User 1 Creates
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createInboxApi(
                conn1,
                await Endpoint.createThreadApi(conn1),
                await Endpoint.createStoreApi(conn1),
            );
            const iId = await api1.createInbox(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // User 2
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createInboxApi(
                conn2,
                await Endpoint.createThreadApi(conn2),
                await Endpoint.createStoreApi(conn2),
            );

            // Public
            const connPub = await Endpoint.connectPublic(solutionId, bridgeUrl);
            const apiPub = await Endpoint.createInboxApi(
                connPub,
                await Endpoint.createThreadApi(connPub),
                await Endpoint.createStoreApi(connPub),
            );

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // User 2 Denied
            await expectError(async () => await api2.getInbox(iId));
            await expectError(
                async () =>
                    await api2.updateInbox(
                        iId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        undefined,
                        2,
                        false,
                        false,
                    ),
            );
            await expectError(async () => await api2.deleteInbox(iId));
            await expectError(
                async () => await api2.listEntries(iId, { skip: 0, limit: 1, sortOrder: "desc" }),
            );

            // Public Denied
            await expectError(async () => await apiPub.getInbox(iId));
            await expectError(
                async () =>
                    await apiPub.createInbox(
                        contextId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );
            await expectError(async () => await apiPub.deleteInbox(iId));
        }, args);
    });

    test("Creating/Updating inbox with owner only policy", async ({ page, backend, cli }) => {
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
            const api1 = await Endpoint.createInboxApi(
                conn1,
                await Endpoint.createThreadApi(conn1),
                await Endpoint.createStoreApi(conn1),
            );
            const enc = new TextEncoder();
            const usersArr = [
                { userId: users.u1.id, pubKey: users.u1.pubKey },
                { userId: users.u2.id, pubKey: users.u2.pubKey },
            ];

            const policy = {
                get: "owner",
                update: "owner",
                delete_: "owner",
                updatePolicy: "owner",
                updaterCanBeRemovedFromManagers: "no",
                ownerCanBeRemovedFromManagers: "no",
            } as ContainerPolicy;

            const iId = await api1.createInbox(
                contextId,
                usersArr,
                usersArr,
                enc.encode("p"),
                enc.encode("p"),
                undefined,
                policy,
            );

            // User 2 Access Check
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createInboxApi(
                conn2,
                await Endpoint.createThreadApi(conn2),
                await Endpoint.createStoreApi(conn2),
            );

            let u2Access = false;
            try {
                await api2.getInbox(iId);
                u2Access = true;
            } catch {}

            // Update Policy check (keep strict)
            await api1.updateInbox(
                iId,
                usersArr,
                usersArr,
                enc.encode("p"),
                enc.encode("p"),
                undefined,
                1,
                true,
                true,
                policy,
            );

            return { u2Access, policy };
        }, args);

        expect(result.u2Access).toBe(false);
    });
});
