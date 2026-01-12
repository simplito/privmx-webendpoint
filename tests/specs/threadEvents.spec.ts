import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import { ThreadEventSelectorType, ThreadEventType } from "../../src/Types";
import type { Endpoint } from "../../src";
import { setupUsers } from "../test-utils";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

test.describe("CoreTest: Thread Events", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
        await page.evaluate(async () => {
            await window.Endpoint.setup("../../dist/assets");
        });
    });

    // =========================================================================
    // THREAD EVENTS
    // =========================================================================

    test("Listening on ThreadCreatedEvent", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            eventType: ThreadEventType,
            selectorType: ThreadEventSelectorType,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, eventType, selectorType }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const threadApi = await Endpoint.createThreadApi(connection);
                const eventQueue = await Endpoint.getEventQueue();
                const enc = new TextEncoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                // Pop libConnectedEvent
                await eventQueue.waitEvent();

                // 1. Subscribe
                // Replicating: threadApi.buildSubscriptionQuery(THREAD_CREATE, CONTEXT_ID, contextId)
                const query = await threadApi.buildSubscriptionQuery(
                    eventType.THREAD_CREATE,
                    selectorType.CONTEXT_ID,
                    contextId,
                );
                await threadApi.subscribeFor([query]);

                // 2. Action
                const threadId = await threadApi.createThread(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("p"),
                    enc.encode("p"),
                );

                // 3. Wait
                const event = await eventQueue.waitEvent();
                const connId = await connection.getConnectionId();

                return { event, threadId, connId };
            },
            args,
        );

        expect(result.event.type).toEqual("threadCreated");
        expect(result.event.connectionId).toEqual(result.connId);
        expect(result.event.data).toBeDefined();
        expect((result.event.data as any).threadId).toEqual(result.threadId);
        expect((result.event.data as any).contextId).toEqual(args.contextId);
    });

    test.fixme("Listening on ThreadCreatedEvent without proper subscription", async ({ // BUG - libBreak is not always emitted
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const eventQueue = await Endpoint.getEventQueue();
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Pop libConnectedEvent
            await eventQueue.waitEvent();

            // No Subscription

            // 2. Action
            await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // 3. Wait with Timeout (simulate Break)
            setTimeout(() => {
                eventQueue.emitBreakEvent();
            }, 5000);
            const event = await eventQueue.waitEvent();

            return { event };
        }, args);

        // Should NOT be threadCreated
        expect(result.event.type).toEqual("libBreak");
    });

    test("Listening on ThreadUpdatedEvent", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            eventType: ThreadEventType,
            selectorType: ThreadEventSelectorType,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, eventType, selectorType }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const threadApi = await Endpoint.createThreadApi(connection);
                const eventQueue = await Endpoint.getEventQueue();
                const enc = new TextEncoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                // Pop libConnectedEvent
                await eventQueue.waitEvent();

                // Setup
                const tId = await threadApi.createThread(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("p"),
                    enc.encode("p"),
                );
                const tV1 = await threadApi.getThread(tId);

                // 1. Subscribe
                const query = await threadApi.buildSubscriptionQuery(
                    eventType.THREAD_UPDATE,
                    selectorType.THREAD_ID,
                    tId,
                );
                await threadApi.subscribeFor([query]);

                // 2. Action
                await threadApi.updateThread(
                    tId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("new"),
                    enc.encode("new"),
                    tV1.version,
                    true,
                    true,
                );

                // 3. Wait
                const event = await eventQueue.waitEvent();
                return { event, tId };
            },
            args,
        );

        expect(result.event.type).toEqual("threadUpdated");
        expect(result.event.data).toBeDefined();
        expect((result.event.data as any).threadId).toEqual(result.tId);
        // Verify meta matches "new"
        const pubMeta = Buffer.from(
            Object.values((result.event.data as any).publicMeta),
        ).toString();
        expect(pubMeta).toEqual("new");
    });

    test.fixme("Listening on ThreadUpdatedEvent without proper subscription", async ({ // BUG - libBreak is not always emitted
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const eventQueue = await Endpoint.getEventQueue();
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Pop libConnectedEvent
            await eventQueue.waitEvent();

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const tV1 = await threadApi.getThread(tId);

            // Action without Sub
            await threadApi.updateThread(
                tId,
                [u1Obj],
                [u1Obj],
                enc.encode("n"),
                enc.encode("n"),
                tV1.version,
                true,
                true,
            );

            // Wait/Break
            setTimeout(() => {
                eventQueue.emitBreakEvent();
            }, 5000);
            const event = await eventQueue.waitEvent();

            return { event };
        }, args);

        expect(result.event.type).toEqual("libBreak");
    });

    test("Listening on ThreadDeletedEvent", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            eventType: ThreadEventType,
            selectorType: ThreadEventSelectorType,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, eventType, selectorType }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const threadApi = await Endpoint.createThreadApi(connection);
                const eventQueue = await Endpoint.getEventQueue();
                const enc = new TextEncoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                // Pop libConnectedEvent
                await eventQueue.waitEvent();

                const tId = await threadApi.createThread(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("p"),
                    enc.encode("p"),
                );

                // 1. Subscribe
                const query = await threadApi.buildSubscriptionQuery(
                    eventType.THREAD_DELETE,
                    selectorType.THREAD_ID,
                    tId,
                );
                await threadApi.subscribeFor([query]);

                // 2. Action
                await threadApi.deleteThread(tId);

                // 3. Wait
                const event = await eventQueue.waitEvent();
                return { event, tId };
            },
            args,
        );

        expect(result.event.type).toEqual("threadDeleted");
        expect(result.event.data).toBeDefined();
        expect((result.event.data as any).threadId).toEqual(result.tId);
    });

    test.fixme("Listening on ThreadDeletedEvent without proper subscription", async ({  // BUG - libBreak is not always emitted
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const eventQueue = await Endpoint.getEventQueue();
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Pop libConnectedEvent
            await eventQueue.waitEvent();

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            await threadApi.deleteThread(tId);

            setTimeout(() => {
                eventQueue.emitBreakEvent();
            }, 5000);
            const event = await eventQueue.waitEvent();

            return { event };
        }, args);

        expect(result.event.type).toEqual("libBreak");
    });

    // =========================================================================
    // MESSAGE EVENTS
    // =========================================================================

    test("Listening on ThreadStatsChangedEvent via Message", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            eventType: ThreadEventType,
            selectorType: ThreadEventSelectorType,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, eventType, selectorType }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const threadApi = await Endpoint.createThreadApi(connection);
                const eventQueue = await Endpoint.getEventQueue();
                const enc = new TextEncoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                // Pop libConnectedEvent
                await eventQueue.waitEvent();

                const tId = await threadApi.createThread(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("p"),
                    enc.encode("p"),
                );
                // Subscribe to STATS changes on this thread
                const query = await threadApi.buildSubscriptionQuery(
                    eventType.THREAD_STATS,
                    selectorType.THREAD_ID,
                    tId,
                );
                await threadApi.subscribeFor([query]);
                // Sending a message changes stats (msg count increases)
                await threadApi.sendMessage(
                    tId,
                    enc.encode("p"),
                    enc.encode("p"),
                    enc.encode("data"),
                );
                const event = await eventQueue.waitEvent();
                return { event, tId };
            },
            args,
        );

        expect(result.event.type).toEqual("threadStatsChanged");
        expect(result.event.data).toBeDefined();
        expect((result.event.data as any).threadId).toEqual(result.tId);
        expect((result.event.data as any).messagesCount).toBeGreaterThan(0);
    });

    test("Listening on ThreadNewMessageEvent", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            eventType: ThreadEventType,
            selectorType: ThreadEventSelectorType,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, eventType, selectorType }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const threadApi = await Endpoint.createThreadApi(connection);
                const eventQueue = await Endpoint.getEventQueue();
                const enc = new TextEncoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                // Pop libConnectedEvent
                await eventQueue.waitEvent();

                const tId = await threadApi.createThread(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("p"),
                    enc.encode("p"),
                );

                // Subscribe
                const query = await threadApi.buildSubscriptionQuery(
                    eventType.MESSAGE_CREATE,
                    selectorType.THREAD_ID,
                    tId,
                );
                await threadApi.subscribeFor([query]);

                // Action
                const mId = await threadApi.sendMessage(
                    tId,
                    enc.encode("p"),
                    enc.encode("p"),
                    enc.encode("data"),
                );

                // Wait
                const event = await eventQueue.waitEvent();
                return { event, tId, mId };
            },
            args,
        );

        expect(result.event.type).toEqual("threadNewMessage");
        expect(result.event.data).toBeDefined();
        expect((result.event.data as any).info.threadId).toEqual(result.tId);
        expect((result.event.data as any).info.messageId).toEqual(result.mId);
    });

    test("Listening on ThreadMessageUpdatedEvent", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            eventType: ThreadEventType,
            selectorType: ThreadEventSelectorType,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, eventType, selectorType }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const threadApi = await Endpoint.createThreadApi(connection);
                const eventQueue = await Endpoint.getEventQueue();
                const enc = new TextEncoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                // Pop libConnectedEvent
                await eventQueue.waitEvent();

                const tId = await threadApi.createThread(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("p"),
                    enc.encode("p"),
                );
                const mId = await threadApi.sendMessage(
                    tId,
                    enc.encode("p"),
                    enc.encode("p"),
                    enc.encode("data"),
                );

                // Subscribe
                const query = await threadApi.buildSubscriptionQuery(
                    eventType.MESSAGE_UPDATE,
                    selectorType.THREAD_ID,
                    tId,
                );
                await threadApi.subscribeFor([query]);

                // Action
                await threadApi.updateMessage(
                    mId,
                    enc.encode("p"),
                    enc.encode("p"),
                    enc.encode("updated"),
                );

                const event = await eventQueue.waitEvent();
                return { event, mId };
            },
            args,
        );

        expect(result.event.type).toEqual("threadUpdatedMessage"); // Check if actual event name differs
        expect(result.event.data).toBeDefined();
        expect((result.event.data as any).info.messageId).toEqual(result.mId);
    });

    test("Listening on ThreadMessageDeletedEvent", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            eventType: ThreadEventType,
            selectorType: ThreadEventSelectorType,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, eventType, selectorType }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const threadApi = await Endpoint.createThreadApi(connection);
                const eventQueue = await Endpoint.getEventQueue();
                const enc = new TextEncoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                // Pop libConnectedEvent
                await eventQueue.waitEvent();

                const tId = await threadApi.createThread(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("p"),
                    enc.encode("p"),
                );
                const mId = await threadApi.sendMessage(
                    tId,
                    enc.encode("p"),
                    enc.encode("p"),
                    enc.encode("data"),
                );

                // Subscribe
                const query = await threadApi.buildSubscriptionQuery(
                    eventType.MESSAGE_DELETE,
                    selectorType.THREAD_ID,
                    tId,
                );
                await threadApi.subscribeFor([query]);

                // Action
                await threadApi.deleteMessage(mId);

                const event = await eventQueue.waitEvent();
                return { event, mId };
            },
            args,
        );

        expect(result.event.type).toEqual("threadMessageDeleted");
        expect(result.event.data).toBeDefined();
        expect((result.event.data as any).messageId).toEqual(result.mId);
    });

    test("Subscribing for events from invalid module", async ({ page, backend, cli }) => {
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

            // Typo in module "treads"
            await expectError(async () => {
                await threadApi.subscribeFor([`treads/update|contextId=${contextId}`]);
            });

            // "store" module via threadApi (might fail depending on API strictness)
            await expectError(async () => {
                await threadApi.subscribeFor([`store/update|contextId=${contextId}`]);
            });
        }, args);
    });

    test("Listening on CollectionChangedEvent in Thread", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            eventType: ThreadEventType,
            selectorType: ThreadEventSelectorType,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, eventType, selectorType }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const threadApi = await Endpoint.createThreadApi(connection);
                const eventQueue = await Endpoint.getEventQueue();
                const enc = new TextEncoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                // Pop libConnectedEvent
                await eventQueue.waitEvent();

                const tId = await threadApi.createThread(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("p"),
                    enc.encode("p"),
                );

                // Subscribe for Collection Change (e.g. standard thread change subscription)
                // Assuming "collection/change" or similar enum maps to COLLECTION_CHANGE
                // If we don't know the exact string, usually generic subscriptions or ThreadEventSelectorType.THREAD_ID covers it.
                // Using the builder:
                const query = await threadApi.buildSubscriptionQuery(
                    eventType.COLLECTION_CHANGE,
                    selectorType.THREAD_ID,
                    tId,
                );
                // Note: If "collection/change" isn't the string, fallback to what the legacy test used: Types.ThreadEventType.COLLECTION_CHANGE

                await threadApi.subscribeFor([query]);

                const mId = await threadApi.sendMessage(
                    tId,
                    enc.encode("p"),
                    enc.encode("p"),
                    enc.encode("data"),
                );

                const event = await eventQueue.waitEvent();
                return { event, tId, mId };
            },
            args,
        );

        expect(result.event.type).toEqual("collectionChanged");
        expect(result.event.data).toBeDefined();
        expect((result.event.data as any).moduleId).toEqual(result.tId);
        expect((result.event.data as any).affectedItemsCount).toBeGreaterThan(0);
        expect((result.event.data as any).items[0].itemId).toEqual(result.mId);
    });

    // =========================================================================
    // MISSING NEGATIVE TESTS (No Subscription -> Expect LibBreak)
    // =========================================================================

    test.fixme("Listening on ThreadStatsChangedEvent without proper subscription", async ({  // BUG - libBreak is not always emitted
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const eventQueue = await Endpoint.getEventQueue();
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Pop libConnectedEvent
            const res = await eventQueue.waitEvent();
            console.log(res);
            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // Action: Send message triggers stats change
            await threadApi.sendMessage(tId, enc.encode("p"), enc.encode("p"), enc.encode("data"));

            // Wait with Timeout (Expect Break)
            setTimeout(() => {
                eventQueue.emitBreakEvent();
            }, 5000);
            const event = await eventQueue.waitEvent();

            return { event };
        }, args);

        expect(result.event.type).toEqual("libBreak");
    });

    test.fixme("Listening on ThreadNewMessageEvent without proper subscription", async ({  // BUG - libBreak is not always emitted
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const eventQueue = await Endpoint.getEventQueue();
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Pop libConnectedEvent
            await eventQueue.waitEvent();

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // Action: Send Message
            await threadApi.sendMessage(tId, enc.encode("p"), enc.encode("p"), enc.encode("data"));

            // Wait with Timeout
            setTimeout(() => {
                eventQueue.emitBreakEvent();
            }, 5000);
            const event = await eventQueue.waitEvent();

            return { event };
        }, args);

        expect(result.event.type).toEqual("libBreak");
    });

    test.fixme("Listening on ThreadMessageUpdatedEvent without proper subscription", async ({ // BUG - libBreak is not always emitted
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const eventQueue = await Endpoint.getEventQueue();
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Pop libConnectedEvent
            await eventQueue.waitEvent();

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const mId = await threadApi.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("data"),
            );

            // Action: Update Message
            await threadApi.updateMessage(
                mId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("updated"),
            );

            // Wait with Timeout
            setTimeout(() => {
                eventQueue.emitBreakEvent();
            }, 5000);
            const event = await eventQueue.waitEvent();

            return { event };
        }, args);

        expect(result.event.type).toEqual("libBreak");
    });

    test.fixme("Listening on ThreadMessageDeletedEvent without proper subscription", async ({ // BUG - libBreak is not always emitted
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const eventQueue = await Endpoint.getEventQueue();
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Pop libConnectedEvent
            await eventQueue.waitEvent();

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const mId = await threadApi.sendMessage(
                tId,
                enc.encode("p"),
                enc.encode("p"),
                enc.encode("data"),
            );

            // Action: Delete Message
            await threadApi.deleteMessage(mId);

            // Wait with Timeout
            setTimeout(() => {
                eventQueue.emitBreakEvent();
            }, 5000);
            const event = await eventQueue.waitEvent();

            return { event };
        }, args);

        expect(result.event.type).toEqual("libBreak");
    });

    test.fixme("Listening on CollectionChangedEvent in Thread without proper subscription", async ({ // BUG - libBreak is not always emitted
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
            const threadApi = await Endpoint.createThreadApi(connection);
            const eventQueue = await Endpoint.getEventQueue();
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // Pop libConnectedEvent
            await eventQueue.waitEvent();

            const tId = await threadApi.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // Action: Send Message (This normally triggers collectionChanged)
            await threadApi.sendMessage(tId, enc.encode("p"), enc.encode("p"), enc.encode("data"));

            // Wait with Timeout
            setTimeout(() => {
                eventQueue.emitBreakEvent();
            }, 5000);
            const event = await eventQueue.waitEvent();

            return { event };
        }, args);

        expect(result.event.type).toEqual("libBreak");
    });
});
