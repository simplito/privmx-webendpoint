import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import { Endpoint } from "../../dist";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

test.describe("CoreTest: Connection & Contexts", () => {
    async function setupUser2(page: any, cli: any) {
        const user2Keys = await page.evaluate(async () => {
            const Endpoint = window.Endpoint;
            await Endpoint.setup("../../dist/assets");
            const cryptoApi = await window.Endpoint.createCryptoApi();
            const privKey = await cryptoApi.generatePrivateKey();
            return {
                privKey: privKey,
                pubKey: await cryptoApi.derivePublicKey(privKey),
            };
        });

        const user2Id = `user2-${Date.now()}`;

        await cli.call("context/addUserToContext", {
            contextId: testData.contextId,
            userId: user2Id,
            userPubKey: user2Keys.pubKey,
        });

        if (testData.contextId2) {
            try {
                await cli.call("context/addUserToContext", {
                    contextId: testData.contextId2,
                    userId: user2Id,
                    userPubKey: user2Keys.pubKey,
                });
            } catch (e) {}
        }

        return { ...user2Keys, userId: user2Id };
    }

    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    test("Creating multiple instances of connection", async ({ page, backend, cli }) => {
        const user2 = await setupUser2(page, cli);

        const args = {
            bridgeUrl: backend.bridgeUrl,
            user1: { privKey: testData.userPrivKey, id: testData.userId },
            user2: user2,
            solutionId: testData.solutionId,
        };

        const result = await page.evaluate(async ({ bridgeUrl, user1, user2, solutionId }) => {
            const Endpoint = window.Endpoint;
            await Endpoint.setup("../../dist/assets");

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
        const user2 = await setupUser2(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            user1: { privKey: testData.userPrivKey, id: testData.userId },
            user2: user2,
            solutionId: testData.solutionId,
        };

        const result = await page.evaluate(async ({ bridgeUrl, user1, user2, solutionId }) => {
            const Endpoint = window.Endpoint;
            await Endpoint.setup("../../dist/assets");

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

    test.fixme("Connecting to public user", async ({ page, backend }) => {
        const args = { bridgeUrl: backend.bridgeUrl, solutionId: testData.solutionId };

        await page.evaluate(async ({ bridgeUrl, solutionId }) => {
            const Endpoint = window.Endpoint;
            await Endpoint.setup("../../dist/assets");

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
            await Endpoint.setup("../../dist/assets");
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
            await Endpoint.setup("../../dist/assets");
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
        const user2 = await setupUser2(page, cli);
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
                await Endpoint.setup("../../dist/assets");

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
        expect(u1_p1.isActive).toBe(true);

        expect(u2_p1).toBeDefined();
        expect(u2_p1.isActive).toBe(false); // User 2 is NOT connected yet

        // Check Phase 2 (Both connected)
        const u1_p2 = result.usersInfo_2.readItems.find(
            (u: any) => u.user.userId === args.user1.id,
        );
        const u2_p2 = result.usersInfo_2.readItems.find(
            (u: any) => u.user.userId === args.user2.userId,
        );

        expect(u1_p2.isActive).toBe(true);
        expect(u2_p2.isActive).toBe(true); // User 2 IS now connected
    });
});
