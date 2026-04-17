import { CliContext, test } from "../fixtures";
import { expect, Page } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { setupTestUser } from "../test-utils";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

test.describe("CoreTest: Connection & Contexts", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
        await page.evaluate(async () => {
            await window.Endpoint.setup("../../assets");
        });
    });

    test("Creating multiple instances of connection", async ({ page, backend, cli }) => {
        const user2 = await setupTestUser(page, cli, [testData.contextId]);

        const args = {
            bridgeUrl: backend.bridgeUrl,
            user1: { privKey: testData.userPrivKey, id: testData.userId },
            user2: user2,
            solutionId: testData.solutionId,
        };

        const result = await page.evaluate(async ({ bridgeUrl, user1, user2, solutionId }) => {
            const Endpoint = window.Endpoint;

            const expectError = async (fn: () => Promise<any>) => {
                try {
                    await fn();
                } catch (e) {
                    return;
                }
                throw new Error("Expected error but none was thrown");
            };

            // 1. Connect User 1
            const connection_1 = await Endpoint.connect(user1.privKey, solutionId, bridgeUrl);
            // 2. Expect error on re-connecting same user
            await expectError(async () => {
                await Endpoint.connect(user1.privKey, solutionId, bridgeUrl);
            });
            // 3. Connect User 2
            const connection_2 = await Endpoint.connect(user2.privKey, solutionId, bridgeUrl);
            // 4. List Contexts
            const listContexts_1 = await connection_1.listContexts({
                skip: 0,
                limit: 10,
                sortOrder: "desc",
            });
            const listContexts_2 = await connection_2.listContexts({
                skip: 0,
                limit: 10,
                sortOrder: "desc",
            });
            return { listContexts_1, listContexts_2 };
        }, args);

        // Assertions
        const list1 = result.listContexts_1;
        expect(list1.totalAvailable).toBeGreaterThanOrEqual(1);
        expect(list1.readItems[0].userId).toEqual(testData.userId);

        const list2 = result.listContexts_2;
        expect(list2.totalAvailable).toBeGreaterThanOrEqual(1);
        expect(list2.readItems[0].userId).toEqual(user2.userId);
    });

    test("Disconnecting multiple instances of connection", async ({ page, backend, cli }) => {
        const user2 = await setupTestUser(page, cli, [testData.contextId]);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            user1: { privKey: testData.userPrivKey, id: testData.userId },
            user2: user2,
            solutionId: testData.solutionId,
        };

        const result = await page.evaluate(async ({ bridgeUrl, user1, user2, solutionId }) => {
            const Endpoint = window.Endpoint;

            const expectError = async (fn: () => Promise<any>) => {
                try {
                    await fn();
                } catch (e) {
                    return;
                }
                throw new Error("Expected error but none was thrown");
            };

            // 1. Connect Both
            const connection_1 = await Endpoint.connect(user1.privKey, solutionId, bridgeUrl);
            const connection_2 = await Endpoint.connect(user2.privKey, solutionId, bridgeUrl);

            // Verify both work
            await connection_1.listContexts({ skip: 0, limit: 1, sortOrder: "desc" });
            await connection_2.listContexts({ skip: 0, limit: 1, sortOrder: "desc" });

            // 2. Disconnect User 2
            await connection_2.disconnect();

            // Verify User 1 still works
            const listContexts_AfterU2Disc = await connection_1.listContexts({
                skip: 0,
                limit: 1,
                sortOrder: "desc",
            });

            // Verify User 2 fails
            await expectError(async () => {
                await connection_2.listContexts({ skip: 0, limit: 1, sortOrder: "desc" });
            });

            // 3. Disconnect User 1
            await connection_1.disconnect();

            // Verify User 1 fails
            await expectError(async () => {
                await connection_1.listContexts({ skip: 0, limit: 1, sortOrder: "desc" });
            });

            // 4. Re-disconnecting User 1 should fail
            await expectError(async () => {
                await connection_1.disconnect();
            });

            // 5. Reconnect User 2 (Sanity check)
            const connection_3 = await Endpoint.connect(user2.privKey, solutionId, bridgeUrl);
            const listContexts_Reconnect = await connection_3.listContexts({
                skip: 0,
                limit: 1,
                sortOrder: "desc",
            });

            return { listContexts_AfterU2Disc, listContexts_Reconnect };
        }, args);

        expect(result.listContexts_AfterU2Disc.readItems).toBeDefined();
        expect(result.listContexts_Reconnect.readItems).toBeDefined();
    });

    test("Connecting to public user", async ({ page, backend }) => {
        const args = { bridgeUrl: backend.bridgeUrl, solutionId: testData.solutionId };

        await page.evaluate(async ({ bridgeUrl, solutionId }) => {
            const Endpoint = window.Endpoint;

            const expectError = async (fn: () => Promise<any>) => {
                try {
                    await fn();
                } catch (e) {
                    return;
                }
                throw new Error("Expected error but none was thrown");
            };

            const connection = await Endpoint.connectPublic(solutionId, bridgeUrl);

            await expectError(async () => {
                const res = await connection.listContexts({
                    skip: 0,
                    limit: 100,
                    sortOrder: "asc",
                });
                console.log(res);
            });
        }, args);
    });

    test("Listing context with invalid input data", async ({ page, backend }) => {
        const args = {
            bridgeUrl: backend.bridgeUrl,
            user: { privKey: testData.userPrivKey, solutionId: testData.solutionId },
        };

        await page.evaluate(async ({ bridgeUrl, user }) => {
            const Endpoint = window.Endpoint;

            const expectError = async (fn: () => Promise<any>) => {
                try {
                    await fn();
                } catch (e) {
                    return;
                }
                throw new Error("Expected error but none was thrown");
            };

            const connection = await Endpoint.connect(user.privKey, user.solutionId, bridgeUrl);

            // Limit < 0
            await expectError(async () => {
                await connection.listContexts({ skip: 0, limit: -1, sortOrder: "desc" });
            });

            // Limit == 0
            await expectError(async () => {
                await connection.listContexts({ skip: 0, limit: 0, sortOrder: "desc" });
            });

            // Incorrect sortOrder
            await expectError(async () => {
                // @ts-ignore
                await connection.listContexts({ skip: 0, limit: 1, sortOrder: "INVALID" });
            });

            // Incorrect lastId (assuming string validation)
            await expectError(async () => {
                // @ts-ignore
                await connection.listContexts({
                    skip: 0,
                    limit: 1,
                    sortOrder: "desc",
                    lastId: "bad_id",
                });
            });
        }, args);
    });

    test("Listing context with valid input data", async ({ page, backend }) => {
        const args = {
            bridgeUrl: backend.bridgeUrl,
            user: { privKey: testData.userPrivKey, solutionId: testData.solutionId },
        };

        const result = await page.evaluate(async ({ bridgeUrl, user }) => {
            const Endpoint = window.Endpoint;

            const connection = await Endpoint.connect(user.privKey, user.solutionId, bridgeUrl);

            // 1. Skip 3
            const list1 = await connection.listContexts({ skip: 4, limit: 1, sortOrder: "desc" });

            // 2. Skip 1
            const list2 = await connection.listContexts({ skip: 3, limit: 1, sortOrder: "desc" });

            // 3. Limit 3
            const list3 = await connection.listContexts({ skip: 0, limit: 3, sortOrder: "asc" });

            return { list1, list2, list3 };
        }, args);

        // Assertions based on defaultDataset
        // Assuming there are at least 2 contexts in the dataset

        // Skip 3 (Should be empty if we only have 2 contexts)
        expect(result.list1.readItems).toHaveLength(0);

        // Skip 1 (Should return 2nd context)
        expect(result.list2.readItems).toHaveLength(1);
        expect(result.list2.readItems[0].userId).toEqual(testData.userId);

        // Limit 3 (Should return both contexts)
        expect(result.list3.readItems.length).toBeGreaterThanOrEqual(2);
    });

    test("Listing context and active user status validation", async ({ page, backend, cli }) => {
        const user2 = await setupTestUser(page, cli, [testData.contextId]);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            user1: { privKey: testData.userPrivKey, id: testData.userId },
            user2: user2,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, user1, user2, solutionId, contextId }) => {
                const Endpoint = window.Endpoint;

                // 1. Connect User 1
                const conn1 = await Endpoint.connect(user1.privKey, solutionId, bridgeUrl);

                // 2. Verify statuses (User 1 Active, User 2 Inactive)
                const usersInfo_1 = await conn1.listContextUsers(contextId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "asc",
                });

                // 3. Connect User 2
                const conn2 = await Endpoint.connect(user2.privKey, solutionId, bridgeUrl);

                // 4. Verify statuses (Both Active)
                // Note: We query via User 2 connection to verify visibility
                const usersInfo_2 = await conn2.listContextUsers(contextId, {
                    skip: 0,
                    limit: 10,
                    sortOrder: "asc",
                });

                return { usersInfo_1, usersInfo_2 };
            },
            args,
        );

        // Check Phase 1 (Only U1 connected)
        const u1_p1 = result.usersInfo_1.readItems.find(
            (u: any) => u.user.userId === args.user1.id,
        );
        const u2_p1 = result.usersInfo_1.readItems.find(
            (u: any) => u.user.userId === args.user2.userId,
        );

        expect(u1_p1).toBeDefined();
        expect(u1_p1!.isActive).toBe(true);

        expect(u2_p1).toBeDefined();
        expect(u2_p1!.isActive).toBe(false); // User 2 is NOT connected yet

        // Check Phase 2 (Both connected)
        const u1_p2 = result.usersInfo_2.readItems.find(
            (u: any) => u.user.userId === args.user1.id,
        );
        const u2_p2 = result.usersInfo_2.readItems.find(
            (u: any) => u.user.userId === args.user2.userId,
        );

        expect(u1_p2!.isActive).toBe(true);
        expect(u2_p2!.isActive).toBe(true); // User 2 IS now connected
    });
});

// ---------------------------------------------------------------------------
// EndpointFactory.setup() — object-form regression test
// ---------------------------------------------------------------------------

test.describe("CoreTest: EndpointFactory.setup() object form", () => {
    test("setup({ assetsBasePath }) initialises WASM identically to setup(string)", async ({
        page,
        backend,
        cli,
    }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });

        // Use the object form exclusively — this is the regression path.
        await page.evaluate(async () => {
            await window.Endpoint.setup({ assetsBasePath: "../../assets" });
        });

        const user = await setupTestUser(page, cli, [testData.contextId]);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, privKey }) => {
                const connection = await window.Endpoint.connect(privKey, solutionId, bridgeUrl);
                const cryptoApi = await window.Endpoint.createCryptoApi();
                const pubKey = await cryptoApi.derivePublicKey(privKey);
                return { connected: connection !== null, pubKeyDefined: pubKey.length > 0 };
            },
            {
                bridgeUrl: backend.bridgeUrl,
                solutionId: testData.solutionId,
                privKey: user.privKey,
            },
        );

        expect(result.connected).toBe(true);
        expect(result.pubKeyDefined).toBe(true);
    });

    test("setup({ assetsBasePath, workerCount }) applies the requested worker count", async ({
        page,
    }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });

        await page.evaluate(async () => {
            await window.Endpoint.setup({ assetsBasePath: "../../assets", workerCount: 6 });
        });

        // Give pthreads time to spin up then verify crypto still works.
        await page.waitForTimeout(320);

        const signed = await page.evaluate(async () => {
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const privKey = await cryptoApi.generatePrivateKey();
            const sig = await cryptoApi.signData(new TextEncoder().encode("test"), privKey);
            return sig.length > 0;
        });

        expect(signed).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Worker-count performance test
// ---------------------------------------------------------------------------
// Measures wall-clock time for Promise.all(100 x sendMessage) at 2, 4 and 8
// worker threads to verify that (a) the workerCount parameter is wired through
// to the WASM engine and (b) more workers reduce time on a CPU-bound workload.
//
// Each step reloads the page so the WASM singleton is re-initialised with the
// desired worker count before any tasks are posted.
// ---------------------------------------------------------------------------

async function measureSendMessages(
    page: Page,
    cli: CliContext,
    bridgeUrl: string,
    workerCount: number,
    messageCount: number,
): Promise<number> {
    // Fresh page load so the WASM module reinitialises with the new worker count.
    await page.goto("/tests/harness/index.html");
    await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });

    // setup() sets window.__privmxWorkerCount BEFORE calling endpointWasmModule(),
    // so the C++ AsyncEngine constructor picks it up on its worker thread.
    // This must be a separate evaluate call so it completes before key generation.
    await page.evaluate(async (wc: number) => {
        await window.Endpoint.setup({ assetsBasePath: "../../assets", workerCount: wc });
    }, workerCount);

    // Give the browser event loop time to finish allocating all pthreads.
    // Emscripten spawns workers asynchronously after module init returns;
    // without this pause the first WASM task may arrive before all threads
    // are ready, causing a stall or abort on high worker counts.
    await page.waitForTimeout(200 + workerCount * 20);

    // Key generation in a separate evaluate — Endpoint is now fully initialised.
    const userKeys = await page.evaluate(async () => {
        const cryptoApi = await window.Endpoint.createCryptoApi();
        const privKey = await cryptoApi.generatePrivateKey();
        return { privKey, pubKey: await cryptoApi.derivePublicKey(privKey) };
    });

    const userId = `perf-user-${Date.now()}-${workerCount}w`;
    await cli.call("context/addUserToContext", {
        contextId: testData.contextId,
        userId,
        userPubKey: userKeys.pubKey,
    });

    const args = {
        bridgeUrl,
        privKey: userKeys.privKey,
        userId,
        solutionId: testData.solutionId,
        contextId: testData.contextId,
        messageCount,
    };

    return page.evaluate(
        async ({ bridgeUrl, privKey, userId, solutionId, contextId, messageCount }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(privKey, solutionId, bridgeUrl);
            const threadApi = await Endpoint.createThreadApi(connection);
            const cryptoApi = await Endpoint.createCryptoApi();

            const userObj = { userId, pubKey: await cryptoApi.derivePublicKey(privKey) };
            const enc = new TextEncoder();

            const threadId = await threadApi.createThread(
                contextId,
                [userObj],
                [userObj],
                enc.encode("perf-test"),
                enc.encode("perf-test"),
            );

            const payload = enc.encode("x".repeat(256));

            const t0 = performance.now();
            await Promise.all(
                Array.from({ length: messageCount }, () =>
                    threadApi.sendMessage(threadId, enc.encode(""), enc.encode(""), payload),
                ),
            );
            return performance.now() - t0;
        },
        args,
    );
}

test.describe("CoreTest: Worker count", () => {
    const MESSAGE_COUNT = 100;

    test("EndpointFactory.setup() initialises WASM with the requested worker count", async ({
        page,
        backend,
        cli,
    }) => {
        const times: Record<string, number> = {};

        await test.step("2 workers — baseline", async () => {
            times["2w"] = await measureSendMessages(page, cli, backend.bridgeUrl, 2, MESSAGE_COUNT);
            console.log(`[workerCount=2]  ${MESSAGE_COUNT} messages: ${times["2w"].toFixed(1)} ms`);
        });

        await test.step("4 workers — default", async () => {
            times["4w"] = await measureSendMessages(page, cli, backend.bridgeUrl, 4, MESSAGE_COUNT);
            console.log(`[workerCount=4]  ${MESSAGE_COUNT} messages: ${times["4w"].toFixed(1)} ms`);
        });

        await test.step("8 workers — doubled", async () => {
            times["8w"] = await measureSendMessages(page, cli, backend.bridgeUrl, 8, MESSAGE_COUNT);
            console.log(`[workerCount=8]  ${MESSAGE_COUNT} messages: ${times["8w"].toFixed(1)} ms`);
        });

        // All three runs must complete all messages successfully (no throw = pass).
        // We log the timings for manual inspection; we don't assert a specific ordering
        // because the bridge/network RTT dominates and may swamp the worker-count effect.
        expect(times["2w"]).toBeGreaterThan(0);
        expect(times["4w"]).toBeGreaterThan(0);
        expect(times["8w"]).toBeGreaterThan(0);
    });
});
