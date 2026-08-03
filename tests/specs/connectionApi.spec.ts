import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import { ThreadEventType, ThreadEventSelectorType } from "../../src/Types";
import type { Endpoint } from "../../src";
import { setupUsers } from "../test-utils";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

// Exercises the connection-level ergonomics added to `Connection`:
//   - `connection.getXApi()` instance getters (alternative to
//     `EndpointFactory.createXApi(connection)`)
//   - `connection.getEventManager()` wired to the shared event loop
test.describe("CoreTest: Connection API getters", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    test("connection.getThreadApi() returns a working, cached API instance", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            user: users.u1,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, user }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(user.privKey, solutionId, bridgeUrl);

            const threadApi = await connection.getThreadApi();

            // The getter resolves the same cached instance as the factory method.
            const sameAsFactory = threadApi === (await Endpoint.createThreadApi(connection));
            // Repeated getter calls hand back the same instance.
            const stableAcrossCalls = threadApi === (await connection.getThreadApi());

            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const userObj = { userId: user.id, pubKey: user.pubKey };

            const threadId = await threadApi.createThread(
                contextId,
                [userObj],
                [userObj],
                enc.encode("meta"),
                enc.encode("meta"),
            );
            await threadApi.sendMessage(
                threadId,
                enc.encode(""),
                enc.encode(""),
                enc.encode("hello via getThreadApi"),
            );
            const page1 = await threadApi.listMessages(threadId, {
                skip: 0,
                limit: 10,
                sortOrder: "desc",
            });

            return {
                sameAsFactory,
                stableAcrossCalls,
                threadId,
                messageCount: page1.readItems.length,
                firstMessage: dec.decode(page1.readItems[0].data),
            };
        }, args);

        expect(result.sameAsFactory).toBe(true);
        expect(result.stableAcrossCalls).toBe(true);
        expect(result.threadId).toBeTruthy();
        expect(result.messageCount).toBe(1);
        expect(result.firstMessage).toBe("hello via getThreadApi");
    });

    test("every connection.getXApi() getter resolves the same instance as the factory", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            user: users.u1,
        };

        const identities = await page.evaluate(async ({ bridgeUrl, solutionId, user }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(user.privKey, solutionId, bridgeUrl);

            return {
                thread: (await connection.getThreadApi()) === (await Endpoint.createThreadApi(connection)),
                store: (await connection.getStoreApi()) === (await Endpoint.createStoreApi(connection)),
                inbox: (await connection.getInboxApi()) === (await Endpoint.createInboxApi(connection)),
                kvdb: (await connection.getKvdbApi()) === (await Endpoint.createKvdbApi(connection)),
                event: (await connection.getEventApi()) === (await Endpoint.createEventApi(connection)),
            };
        }, args);

        expect(identities.thread).toBe(true);
        expect(identities.store).toBe(true);
        expect(identities.inbox).toBe(true);
        expect(identities.kvdb).toBe(true);
        expect(identities.event).toBe(true);
    });

    test("connection.getEventManager() delivers a live message event to a subscribed callback", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            user: users.u1,
            eventType: ThreadEventType,
            selectorType: ThreadEventSelectorType,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, user, eventType, selectorType }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(user.privKey, solutionId, bridgeUrl);
                const threadApi = await connection.getThreadApi();
                const enc = new TextEncoder();
                const userObj = { userId: user.id, pubKey: user.pubKey };

                const threadId = await threadApi.createThread(
                    contextId,
                    [userObj],
                    [userObj],
                    enc.encode("meta"),
                    enc.encode("meta"),
                );

                // The single connection-level event manager; starts/reuses the
                // shared app-wide event loop automatically and is cached.
                const events = await connection.getEventManager();
                const stableAcrossCalls = events === (await connection.getEventManager());

                let resolveEvent!: (e: any) => void;
                const received = new Promise<any>((resolve) => {
                    resolveEvent = resolve;
                });

                // createThreadSubscription isn't on the standalone bundle, so the
                // module-tagged subscription is built inline here.
                await events.subscribe([
                    {
                        module: "thread",
                        type: eventType.MESSAGE_CREATE,
                        selector: selectorType.THREAD_ID,
                        id: threadId,
                        callbacks: [(e) => resolveEvent(e)],
                    },
                ]);

                const messageId = await threadApi.sendMessage(
                    threadId,
                    enc.encode(""),
                    enc.encode(""),
                    enc.encode("data"),
                );

                const event: any = await Promise.race([
                    received,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("timeout waiting for event")), 8000),
                    ),
                ]);

                return {
                    stableAcrossCalls,
                    type: event.type,
                    eventThreadId: event.data?.info?.threadId,
                    eventMessageId: event.data?.info?.messageId,
                    threadId,
                    messageId,
                };
            },
            args,
        );

        expect(result.stableAcrossCalls).toBe(true);
        expect(result.type).toEqual("threadNewMessage");
        expect(result.eventThreadId).toEqual(result.threadId);
        expect(result.eventMessageId).toEqual(result.messageId);
    });
});
