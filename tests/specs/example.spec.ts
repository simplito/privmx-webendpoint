import { test } from "../fixtures"; 
import { expect } from '@playwright/test';
import type { Endpoint, Types } from "../../dist";
import { testData } from "../datasets/testData";

// 1. Extend Window interface globally for TypeScript support inside evaluate
declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

test.describe("Core Functionality", () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/tests/harness/index.html');
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    test("should successfully create and retrieve a thread via WASM", async ({ page, backend }) => {
        
        const browserContextArgs = {
            bridgeUrl: backend.bridgeUrl,
            user: {
                privKey: testData.userPrivKey,
                userId: testData.userId,
                pubKey: testData.userPubKey,
                solutionId: testData.solutionId
            }
        };

        const result = await page.evaluate(async ({ bridgeUrl, user }) => {
            if (!window.Endpoint) throw new Error("Endpoint not loaded on window");
            
            const Endpoint = window.Endpoint;
            
            await Endpoint.setup("../../dist/assets");
            
            const connection = await Endpoint.connect(user.privKey, user.solutionId, bridgeUrl);
            const threadsApi = await Endpoint.createThreadApi(connection);

            const defaultPaging: Types.PagingQuery = {skip: 0, limit: 10, sortOrder: "desc"};
            const contexts = await connection.listContexts(defaultPaging);
            
            if (contexts.readItems.length === 0) {
                throw new Error("Setup Error: No contexts found in dataset");
            }
            const contextId = contexts.readItems[0].contextId;

            const threadId = await threadsApi.createThread(
                contextId, 
                [{userId: user.userId, pubKey: user.pubKey}], 
                [{userId: user.userId, pubKey: user.pubKey}], 
                new Uint8Array(), 
                new Uint8Array()
            );

            const thread = await threadsApi.getThread(threadId);
            
            return { thread };     

        }, browserContextArgs);

        await test.step("Verify Thread", async () => {
            expect(result.thread).toBeDefined();
            expect(result.thread.contextId).toBeDefined();
            expect(result.thread.contextId).toEqual(testData.contextId);
        });
    });

    test("should create a solution via CLI", async ({ cli }) => {
        const solutionName = "Automation Test Solution";
        let solutionId: string;

        await test.step("Create Solution", async () => {
            const response = await cli.call('solution/createSolution', {
                name: solutionName
            });
            expect(response.solutionId).toBeDefined();
            solutionId = response.solutionId;
        });

        await test.step("Verify Solution exists", async () => {
            const response = await cli.call('solution/getSolution', { id: solutionId });
            expect(response.solution.name).toEqual(solutionName);
        });
    });
});