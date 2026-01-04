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

test.describe("CoreTest: Events", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    test("Listening on LibConnectedEvent", async ({ page, backend }) => {
        const browserArgs = {
            bridgeUrl: backend.bridgeUrl,
            user: {
                privKey: testData.userPrivKey,
                solutionId: testData.solutionId,
            },
        };

        const result = await page.evaluate(async ({ bridgeUrl, user }) => {
            const Endpoint = window.Endpoint;
            await Endpoint.setup("../../dist/assets");

            // 1. Get Event Queue (Native API)
            const eventQueue = await Endpoint.getEventQueue();

            // 2. Connect
            const connection = await Endpoint.connect(user.privKey, user.solutionId, bridgeUrl);
            const connectionId = await connection.getConnectionId();

            // 3. Wait for the event
            const event = await eventQueue.waitEvent();

            return { connectionId, event };
        }, browserArgs);

        expect(result.event).toBeDefined();
        expect(result.event.type).toEqual("libConnected");
        expect(result.event.connectionId).toEqual(result.connectionId);
    });

    test("Listening on LibConnectedEvent with multiple connections", async ({
        page,
        backend,
        cli,
    }) => {
        // STEP 1: Generate User 2 Identity in the Browser
        // We need to do this first to get the Public Key for the CLI
        const generatedUser = await page.evaluate(async () => {
            const Endpoint = window.Endpoint;
            await Endpoint.setup("../../dist/assets");

            const cryptoApi = await Endpoint.createCryptoApi();
            const privKey = await cryptoApi.generatePrivateKey();

            // Return strings because we need to pass them to Node.js
            return {
                privKey: privKey.toString(), // Pass this back to browser in Step 3
                pubKey: await cryptoApi.derivePublicKey(privKey), // Use this for CLI in Step 2
            };
        });

        // STEP 2: Add User 2 to Context via CLI
        // We generate a dynamic userId to ensure uniqueness
        const user2Id = `user2-${Date.now()}`;
        await cli.call("context/addUserToContext", {
            contextId: testData.contextId, // Using existing context from dataset
            userId: user2Id,
            userPubKey: generatedUser.pubKey,
        });

        // STEP 3: Connect and Listen for Events
        const browserArgs = {
            bridgeUrl: backend.bridgeUrl,
            user1: {
                privKey: testData.userPrivKey,
                solutionId: testData.solutionId,
            },
            user2: {
                privKey: generatedUser.privKey, // The WIF string we generated in Step 1
                solutionId: testData.solutionId,
            },
        };

        const result = await page.evaluate(async ({ bridgeUrl, user1, user2 }) => {
            const Endpoint = window.Endpoint;
            // Setup is likely already done in Step 1, but safe to ensure
            if (!window.wasmReady) await Endpoint.setup("../../dist/assets");

            const eventQueue = await Endpoint.getEventQueue();

            // Connect User 1
            const connection_1 = await Endpoint.connect(user1.privKey, user1.solutionId, bridgeUrl);

            // Connect User 2
            const connection_2 = await Endpoint.connect(user2.privKey, user2.solutionId, bridgeUrl);

            const connectionId_1 = await connection_1.getConnectionId();
            const connectionId_2 = await connection_2.getConnectionId();

            // Wait for both connection events
            const event_1 = await eventQueue.waitEvent();
            const event_2 = await eventQueue.waitEvent();

            return { connectionId_1, connectionId_2, event_1, event_2 };
        }, browserArgs);

        // Verification
        const events = [result.event_1, result.event_2];

        const e1 = events.find((e: any) => e.connectionId === result.connectionId_1);
        expect(e1).toBeDefined();
        expect(e1.type).toEqual("libConnected");

        const e2 = events.find((e: any) => e.connectionId === result.connectionId_2);
        expect(e2).toBeDefined();
        expect(e2.type).toEqual("libConnected");
    });

    test("Listening on LibDisconnectedEvent", async ({ page, backend }) => {
        const browserArgs = {
            bridgeUrl: backend.bridgeUrl,
            user: {
                privKey: testData.userPrivKey,
                solutionId: testData.solutionId,
            },
        };

        const result = await page.evaluate(async ({ bridgeUrl, user }) => {
            const Endpoint = window.Endpoint;
            await Endpoint.setup("../../dist/assets");

            const eventQueue = await Endpoint.getEventQueue();

            const connection = await Endpoint.connect(user.privKey, user.solutionId, bridgeUrl);
            const connectionId = await connection.getConnectionId();

            // Pop the initial 'libConnected' event
            await eventQueue.waitEvent();

            // ACT: Disconnect
            await connection.disconnect();

            // ASSERT: Wait for 'libDisconnected'
            const event = await eventQueue.waitEvent();

            return { connectionId, event };
        }, browserArgs);

        expect(result.event).toBeDefined();
        expect(result.event.type).toEqual("libDisconnected");
        expect(result.event.connectionId).toEqual(result.connectionId);
    });

    test("Listening on LibEmitBreakEvent after emitBreakEvent", async ({ page, backend }) => {
        const result = await page.evaluate(async () => {
            const Endpoint = window.Endpoint;
            await Endpoint.setup("../../dist/assets");

            const eventQueue = await Endpoint.getEventQueue();

            // ACT: Manually trigger break
            await eventQueue.emitBreakEvent();

            // ASSERT: Wait for event
            const event = await eventQueue.waitEvent();

            return { event };
        });

        expect(result.event).toBeDefined();
        expect(result.event.type).toEqual("libBreak");
    });
});
