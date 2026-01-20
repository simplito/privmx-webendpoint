import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { ContainerPolicy, SortOrder } from "../../src/Types";
import { Sort } from "mongodb";
import { setupUsers } from "../test-utils";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

test.describe("ThreadTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
        await page.evaluate(async () => {
            await window.Endpoint.setup("../../assets");
        });
    });

    // =========================================================================
    // THREAD CRUD
    // =========================================================================

    test("Getting thread with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Setup: Create a thread to fetch
            const threadId = await threadApi.createThread(
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

            // 1. Invalid ID
            await expectError(async () => await threadApi.getThread("invalid_value"));

            // 2. Valid ID
            const thread = await threadApi.getThread(threadId);
            return { thread, threadId };
        }, args);

        expect(result.thread.threadId).toEqual(result.threadId);
        expect(result.thread.users[0]).toEqual(users.u1.id);
    });

    test("Listing threads with invalid input data", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // incorrect contextId
            await expectError(
                async () =>
                    await threadApi.listThreads("invalid_value", {
                        skip: 0,
                        limit: 1,
                        sortOrder: "desc",
                    }),
            );
            // limit < 0
            await expectError(
                async () =>
                    await threadApi.listThreads(contextId, {
                        skip: 0,
                        limit: -1,
                        sortOrder: "desc",
                    }),
            );
            // limit == 0
            await expectError(
                async () =>
                    await threadApi.listThreads(contextId, {
                        skip: 0,
                        limit: 0,
                        sortOrder: "desc",
                    }),
            );
            // incorrect sortOrder
            // @ts-ignore
            await expectError(
                async () =>
                    await threadApi.listThreads(contextId, {
                        skip: 0,
                        limit: 1,
                        sortOrder: "invalid_value" as SortOrder,
                    }),
            );
            // incorrect lastId
            // @ts-ignore
            await expectError(
                async () =>
                    await threadApi.listThreads(contextId, {
                        skip: 0,
                        limit: 1,
                        sortOrder: "desc",
                        lastId: "invalid_value",
                    }),
            );
        }, args);
    });

    test("Listing threads with valid input data", async ({ page, backend, cli }) => {
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
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Setup: Create 3 threads
            const tids: string[] = [];
            for (let i = 0; i < 3; i++) {
                tids.push(
                    await threadApi.createThread(
                        contextId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode(`p${i}`),
                        enc.encode(`p${i}`),
                    ),
                );
            }

            // Test Pagination
            const list1 = await threadApi.listThreads(contextId, {
                skip: 4,
                limit: 1,
                sortOrder: "desc",
            });
            const list2 = await threadApi.listThreads(contextId, {
                skip: 0,
                limit: 1,
                sortOrder: "desc",
            }); // Newest
            const list3 = await threadApi.listThreads(contextId, {
                skip: 1,
                limit: 3,
                sortOrder: "asc",
            }); // 2nd oldest onwards

            return { list1, list2, list3, tids };
        }, args);

        expect(result.list1.readItems).toHaveLength(0); // Skip 4 > Total 3
        expect(result.list2.readItems).toHaveLength(1);
        expect(result.list2.readItems[0].threadId).toEqual(result.tids[2]); // Descending
        expect(result.list3.readItems.length).toBeGreaterThanOrEqual(2);
    });

    test("Creating thread with valid/invalid input data", async ({ page, backend, cli }) => {
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

            // incorrect contextId
            await expectError(
                async () =>
                    await threadApi.createThread(
                        "invalid",
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );
            // incorrect users (key mismatch)
            await expectError(
                async () =>
                    await threadApi.createThread(
                        contextId,
                        [{ userId: u1Obj.userId, pubKey: u2Obj.pubKey }],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );
            // incorrect managers (key mismatch)
            await expectError(
                async () =>
                    await threadApi.createThread(
                        contextId,
                        [u1Obj],
                        [{ userId: u1Obj.userId, pubKey: u2Obj.pubKey }],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );
            // no managers
            await expectError(
                async () =>
                    await threadApi.createThread(
                        contextId,
                        [u1Obj],
                        [],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );

            // different users and managers
            const t1 = await threadApi.createThread(
                contextId,
                [u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const thread1 = await threadApi.getThread(t1);

            // same users and managers
            const t2 = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const thread2 = await threadApi.getThread(t2);

            return { thread1, thread2 };
        }, args);

        expect(result.thread1.users[0]).toEqual(users.u2.id);
        expect(result.thread1.managers[0]).toEqual(users.u1.id);
        expect(result.thread2.users[0]).toEqual(users.u1.id);
    });

    test("Updating thread with invalid input data", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const tData = await threadApi.getThread(tId);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // incorrect threadId
            await expectError(
                async () =>
                    await threadApi.updateThread(
                        "invalid",
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        tData.version,
                        false,
                        false,
                    ),
            );
            // incorrect users
            await expectError(
                async () =>
                    await threadApi.updateThread(
                        tId,
                        [{ userId: u1Obj.userId, pubKey: u2Obj.pubKey }],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        tData.version,
                        false,
                        false,
                    ),
            );
            // incorrect managers
            await expectError(
                async () =>
                    await threadApi.updateThread(
                        tId,
                        [u1Obj],
                        [{ userId: u1Obj.userId, pubKey: u2Obj.pubKey }],
                        enc.encode("p"),
                        enc.encode("p"),
                        tData.version,
                        false,
                        false,
                    ),
            );
            // no managers
            await expectError(
                async () =>
                    await threadApi.updateThread(
                        tId,
                        [u1Obj],
                        [],
                        enc.encode("p"),
                        enc.encode("p"),
                        tData.version,
                        false,
                        false,
                    ),
            );
            // incorrect version (force false)
            await expectError(
                async () =>
                    await threadApi.updateThread(
                        tId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        tData.version + 1,
                        false,
                        false,
                    ),
            );
        }, args);
    });

    test("Updating thread with new users", async ({ page, backend, cli }) => {
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
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const tV1 = await threadApi.getThread(tId);

            // Add User 2
            await threadApi.updateThread(
                tId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                tV1.version,
                false,
                false,
            );

            return { thread: await threadApi.getThread(tId) };
        }, args);

        expect(result.thread.users).toHaveLength(2);
    });

    test("Updating thread with new managers", async ({ page, backend, cli }) => {
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
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const tV1 = await threadApi.getThread(tId);

            // Add Manager 2
            await threadApi.updateThread(
                tId,
                [u1Obj],
                [u1Obj, u2Obj],
                enc.encode("p"),
                enc.encode("p"),
                tV1.version,
                false,
                false,
            );

            return { thread: await threadApi.getThread(tId) };
        }, args);

        expect(result.thread.managers).toHaveLength(2);
    });

    test("Updating thread with less users", async ({ page, backend, cli }) => {
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
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            // Create with 2 users
            const tId = await threadApi.createThread(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const tV1 = await threadApi.getThread(tId);

            // Remove User 2
            await threadApi.updateThread(
                tId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                tV1.version,
                false,
                false,
            );

            return { thread: await threadApi.getThread(tId) };
        }, args);

        expect(result.thread.users).toHaveLength(1);
    });

    test("Updating thread with less managers", async ({ page, backend, cli }) => {
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
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            // Create with 2 managers
            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj, u2Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const tV1 = await threadApi.getThread(tId);

            // Remove Manager 2
            await threadApi.updateThread(
                tId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                tV1.version,
                false,
                false,
            );

            return { thread: await threadApi.getThread(tId) };
        }, args);

        expect(result.thread.managers).toHaveLength(1);
    });

    test("Force updating thread with incorrect version", async ({ page, backend, cli }) => {
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
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const tV1 = await threadApi.getThread(tId);

            // Force update with V+1
            await threadApi.updateThread(
                tId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                tV1.version + 1,
                true,
                false,
            );

            return { thread: await threadApi.getThread(tId) };
        }, args);

        expect(result.thread.version).toEqual(2);
    });

    test("Deleting thread with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const api1 = await Endpoint.createThreadApi(conn1);

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createThreadApi(conn2);

            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Setup
            const t1 = await api1.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const t2 = await api1.createThread(
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
            await expectError(async () => await api1.deleteThread("invalid"));

            // Valid Delete (As Manager)
            await api1.deleteThread(t1);
            await expectError(async () => await api1.getThread(t1));

            // Invalid Delete (As User 2 - Not Manager)
            await expectError(async () => await api2.deleteThread(t2));
        }, args);
    });

    // =========================================================================
    // MESSAGES CRUD
    // =========================================================================

    test("Getting message with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const msgId = await threadApi.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("d"),
            );

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // Incorrect Message ID
            await expectError(async () => await threadApi.getMessage("invalid"));

            // Valid Message (after force key gen logic simulation)
            // Just fetching normally here as force key gen is its own test
            const message = await threadApi.getMessage(msgId);
            return { message };
        }, args);

        expect(result.message).toBeDefined();
    });

    test("Listing messages with invalid input data", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // incorrect threadId
            await expectError(
                async () =>
                    await threadApi.listMessages("invalid", {
                        skip: 0,
                        limit: 1,
                        sortOrder: "desc",
                    }),
            );
            // limit < 0
            await expectError(
                async () =>
                    await threadApi.listMessages(contextId, {
                        skip: 0,
                        limit: -1,
                        sortOrder: "desc",
                    }),
            ); // Using ctx ID as thread ID placeholder for invalid check
            // incorrect sortOrder
            // @ts-ignore
            await expectError(
                async () =>
                    await threadApi.listMessages(contextId, {
                        skip: 0,
                        limit: 1,
                        sortOrder: "invalid" as SortOrder,
                    }),
            );
            // incorrect lastId
            // @ts-ignore
            await expectError(
                async () =>
                    await threadApi.listMessages(contextId, {
                        skip: 0,
                        limit: 1,
                        sortOrder: "desc",
                        lastId: "invalid",
                    }),
            );
        }, args);
    });

    test("Listing message with valid input data", async ({ page, backend, cli }) => {
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
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // Send 2 messages
            const m1 = await threadApi.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("1"),
            );
            const m2 = await threadApi.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("2"),
            );

            const list1 = await threadApi.listMessages(tId, {
                skip: 2,
                limit: 1,
                sortOrder: "desc",
            }); // Empty
            const list2 = await threadApi.listMessages(tId, {
                skip: 0,
                limit: 1,
                sortOrder: "desc",
            }); // Last (m2)
            const list3 = await threadApi.listMessages(tId, {
                skip: 0,
                limit: 2,
                sortOrder: "asc",
            }); // Both

            return { list1, list2, list3, m1, m2 };
        }, args);
        expect(result.list1.readItems).toHaveLength(0);
        expect(result.list2.readItems).toHaveLength(1);
        expect(result.list2.readItems[0].info.messageId).toEqual(result.m2);
        expect(result.list3.readItems).toHaveLength(2);
    });

    test("Sending message with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const tId = await threadApi.createThread(
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

            // Incorrect Thread ID
            await expectError(
                async () =>
                    await threadApi.sendMessage(
                        "invalid",
                        enc.encode("p"),
                        enc.encode("p"),
                        enc.encode("d"),
                    ),
            );

            // Msg too big (>1MB)
            const bigData = new Uint8Array(1024 * 1024 + 10);
            await expectError(
                async () =>
                    await threadApi.sendMessage(tId, enc.encode("p"), enc.encode("p"), bigData),
            );

            // Correct Data
            const msgId = await threadApi.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("d"),
            );

            return { msgId };
        }, args);

        expect(result.msgId).toBeDefined();
    });

    test("Updating message with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const msgId = await threadApi.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("d"),
            );
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // Incorrect Msg ID
            await expectError(
                async () =>
                    await threadApi.updateMessage(
                        "invalid",
                        enc.encode("p"),
                        enc.encode("p"),
                        enc.encode("d"),
                    ),
            );

            // Msg too big
            const bigData = new Uint8Array(1024 * 1024 + 10);
            await expectError(
                async () =>
                    await threadApi.updateMessage(msgId, enc.encode("p"), enc.encode("p"), bigData),
            );

            // Correct
            await threadApi.updateMessage(
                msgId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("updated"),
            );
        }, args);
    });

    test("Deleting message with valid/invalid input data", async ({ page, backend, cli }) => {
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
            const api1 = await Endpoint.createThreadApi(conn1);

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createThreadApi(conn2);

            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const tId = await api1.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const msgId = await api1.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("d"),
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
            await expectError(async () => await api1.deleteMessage("invalid"));

            // As User 2 (Not creator/manager)
            await expectError(async () => await api2.deleteMessage(msgId));

            // As User 1 (Creator/Manager)
            await api1.deleteMessage(msgId);
        }, args);
    });

    // =========================================================================
    // POLICIES & PERMISSIONS
    // =========================================================================

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
            const api1 = await Endpoint.createThreadApi(conn1);

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createThreadApi(conn2);

            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const tId = await api1.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const mId = await api1.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("d"),
            );

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // User 2 (Stranger) tries to do everything
            await expectError(async () => await api2.getThread(tId));
            await expectError(
                async () =>
                    await api2.updateThread(
                        tId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        1,
                        false,
                        false,
                    ),
            );
            await expectError(async () => await api2.deleteThread(tId));
            await expectError(async () => await api2.getMessage(mId));
            await expectError(
                async () => await api2.listMessages(tId, { skip: 0, limit: 1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await api2.sendMessage(tId, enc.encode("p"), enc.encode("p"), enc.encode("d")),
            );
            await expectError(
                async () =>
                    await api2.updateMessage(
                        mId,
                        enc.encode("p"),
                        enc.encode("p"),
                        enc.encode("d"),
                    ),
            );
            await expectError(async () => await api2.deleteMessage(mId));
        }, args);
    });

    test("Trying to accessing data using publicAccount", async ({ page, backend, cli }) => {
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

            // Create data
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createThreadApi(conn1);
            const tId = await api1.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // Public User
            const connPub = await Endpoint.connectPublic(solutionId, bridgeUrl); // Empty string for public
            const apiPub = await Endpoint.createThreadApi(connPub);

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(async () => await apiPub.getThread(tId));
            await expectError(
                async () =>
                    await apiPub.listThreads(contextId, { skip: 0, limit: 1, sortOrder: "desc" }),
            );
            await expectError(
                async () =>
                    await apiPub.createThread(
                        contextId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    ),
            );
            await expectError(async () => await apiPub.deleteThread(tId));
        }, args);
    });

    test('Creating/Updating thread with "owner" only policy', async ({ page, backend, cli }) => {
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
            const api1 = await Endpoint.createThreadApi(conn1);

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createThreadApi(conn2);

            const enc = new TextEncoder();
            const usersArr = [
                { userId: users.u1.id, pubKey: users.u1.pubKey },
                { userId: users.u2.id, pubKey: users.u2.pubKey },
            ];

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

            const tId = await api1.createThread(
                contextId,
                usersArr,
                usersArr,
                enc.encode("p"),
                enc.encode("p"),
                ownerPolicy,
            );

            // Verify User 2 cannot access (even though in users list, policy restricts to owner)
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };
            await expectError(async () => await api2.getThread(tId));

            return { tId, ownerPolicy };
        }, args);

        expect(result.tId).toBeDefined();
    });

    test('Updating thread with "all" only policy', async ({ page, backend, cli }) => {
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
            const api1 = await Endpoint.createThreadApi(conn1);

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createThreadApi(conn2);

            const enc = new TextEncoder();
            const usersArr = [
                { userId: users.u1.id, pubKey: users.u1.pubKey },
                { userId: users.u2.id, pubKey: users.u2.pubKey },
            ];

            // Start strict
            const policy: ContainerPolicy = {
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

            const tId = await api1.createThread(
                contextId,
                usersArr,
                usersArr,
                enc.encode("p"),
                enc.encode("p"),
                policy,
            );
            const t1 = await api1.getThread(tId);

            // Update to 'all'
            const allPolicy: any = { ...policy };
            Object.keys(allPolicy.item).forEach((k) => (allPolicy.item[k] = "all"));
            allPolicy.get = "all";
            allPolicy.update = "all";
            allPolicy.updatePolicy = "all";

            await api1.updateThread(
                tId,
                usersArr,
                usersArr,
                enc.encode("p"),
                enc.encode("p"),
                t1.version,
                true,
                true,
                allPolicy,
            );

            // Now User 2 can update
            await api2.updateThread(
                tId,
                usersArr,
                usersArr,
                enc.encode("p"),
                enc.encode("p"),
                t1.version + 1,
                true,
                true,
                allPolicy,
            );
        }, args);
    });

    test("Listing Threads using queryAsJson", async ({ page, backend, cli }) => {
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
            const api = await Endpoint.createThreadApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const jsonMeta = JSON.stringify({ test: 1 });
            await api.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode(jsonMeta),
                enc.encode("p"),
            );

            const list = await api.listThreads(contextId, {
                skip: 0,
                limit: 100,
                sortOrder: "asc",
                queryAsJson: jsonMeta,
            });

            return { count: list.totalAvailable };
        }, args);

        expect(result.count).toEqual(1);
    });

    // =========================================================================
    // CACHE & KEY ROTATION
    // =========================================================================

    test("Checking if cache can detect old keys (sendMessage)", async ({ page, backend, cli }) => {
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
            const api = await Endpoint.createThreadApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // 1. Create & Load to Cache
            const tId = await api.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            await api.getThread(tId);

            // 2. Update with Force New Keys
            const t1 = await api.getThread(tId);
            await api.updateThread(
                tId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                t1.version,
                true,
                true,
            );

            // 3. Send Message (Should recover from Old Key error)
            const mId = await api.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("data"),
            );
            const msg = await api.getMessage(mId);

            return { msg };
        }, args);

        expect(result.msg.statusCode).toEqual(0);
    });

    test("Checking if cache can detect old keys (updateMessage)", async ({
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

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api = await Endpoint.createThreadApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const tId = await api.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const mId = await api.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("data"),
            );
            await api.getThread(tId); // Cache

            // Update Keys
            const t1 = await api.getThread(tId);
            await api.updateThread(
                tId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                t1.version,
                true,
                true,
            );

            // Update Message (Should recover)
            await api.updateMessage(mId, enc.encode("p"), enc.encode("p"), enc.encode("updated"));
            const msg = await api.getMessage(mId);

            return { msg };
        }, args);

        expect(result.msg.statusCode).toEqual(0);
    });

    test("Using api with UserVerifier that always return false", async ({ page, backend, cli }) => {
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
            const api = await Endpoint.createThreadApi(connection);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const tId = await api.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const mId = await api.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("data"),
            );
            // Set Rejecting Verifier
            await connection.setUserVerifier({
                verify: async (requests: any[]) => requests.map(() => false),
            });

            const thread = await api.getThread(tId);
            const msgList = await api.listMessages(tId, { skip: 0, limit: 1, sortOrder: "desc" });

            // Should fail actions
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
                    await api.sendMessage(tId, enc.encode("p"), enc.encode("p"), enc.encode("d")),
            );

            return { threadStatus: thread.statusCode, msgStatus: msgList.readItems[0].statusCode };
        }, args);

        expect(result.threadStatus).toEqual(65550); // Verification Failed Code
        expect(result.msgStatus).toEqual(65550);
    });
});
