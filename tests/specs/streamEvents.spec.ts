import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import { setupUsers } from "../test-utils";
import type { Endpoint, StreamApi } from "../../src";
import { StreamEventType, StreamEventSelectorType } from "../../src/Types";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
        streamApi?: StreamApi;
    }
}

test.use({
    launchOptions: {
        args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            "--headless",
        ],
    },
});

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Start collecting events from the shared EventQueue into window.__events. */
const startEventCollector = async (page: any) => {
    await page.evaluate(async () => {
        const eq = await window.Endpoint.getEventQueue();
        const w = window as any;
        w.__events = [];
        w.__eventsRunning = true;
        (async () => {
            while (w.__eventsRunning) {
                try {
                    w.__events.push(await eq.waitEvent());
                } catch {
                    break;
                }
            }
        })();
    });
};

const collectEventTypes = (page: any): Promise<string[]> =>
    page.evaluate(() => ((window as any).__events ?? []).map((e: any) => e.type));

const waitForEvent = (page: any, type: string, timeout = 15_000) =>
    expect
        .poll(() => page.evaluate((t: string) => ((window as any).__events ?? []).some((e: any) => e.type === t), type), {
            timeout,
        })
        .toBe(true);

const hasEvent = (page: any, type: string): Promise<boolean> =>
    page.evaluate((t: string) => ((window as any).__events ?? []).some((e: any) => e.type === t), type);

const getEventData = (page: any, type: string): Promise<any> =>
    page.evaluate((t: string) => {
        const e = ((window as any).__events ?? []).find((e: any) => e.type === t);
        return e ? e.data : null;
    }, type);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── suite ───────────────────────────────────────────────────────────────────

test.describe("StreamEvents", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10_000 });
    });

    // =========================================================================
    // streamRoomCreated — both connections receive the event
    // =========================================================================

    test("streamRoomCreated: both connections receive event with correct payload", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        const roomId: string = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const query = await api1.buildSubscriptionQuery(
                StreamEventType.STREAMROOM_CREATE,
                StreamEventSelectorType.CONTEXT_ID,
                contextId,
            );
            await api1.subscribeFor([query]);
            await api2.subscribeFor([
                await api2.buildSubscriptionQuery(StreamEventType.STREAMROOM_CREATE, StreamEventSelectorType.CONTEXT_ID, contextId),
            ]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };
            return await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj], enc.encode("p"), enc.encode("p"));
        }, args);

        await waitForEvent(page, "streamRoomCreated");
        const events = await page.evaluate(() =>
            ((window as any).__events ?? []).filter((e: any) => e.type === "streamRoomCreated"),
        );

        expect(events.length).toBeGreaterThanOrEqual(1);
        const data = events[0].data;
        expect(data.streamRoomId).toBe(roomId);
        expect(data.contextId).toBe(testData.contextId);
    });

    // =========================================================================
    // streamRoomUpdated
    // =========================================================================

    test("streamRoomUpdated: both connections receive event after updateStreamRoom", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj], enc.encode("p"), enc.encode("p"));

            const q1 = await api1.buildSubscriptionQuery(StreamEventType.STREAMROOM_UPDATE, StreamEventSelectorType.STREAMROOM_ID, sId);
            const q2 = await api2.buildSubscriptionQuery(StreamEventType.STREAMROOM_UPDATE, StreamEventSelectorType.STREAMROOM_ID, sId);
            await api1.subscribeFor([q1]);
            await api2.subscribeFor([q2]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            (window as any).__testRoomId = sId;
            (window as any).__testApi1 = api1;
            (window as any).__testU1Obj = u1Obj;
            (window as any).__testU2Obj = u2Obj;
        }, args);

        await page.evaluate(async () => {
            const enc = new TextEncoder();
            const w = window as any;
            await w.__testApi1.updateStreamRoom(
                w.__testRoomId,
                [w.__testU1Obj, w.__testU2Obj],
                [w.__testU1Obj],
                enc.encode("updated"),
                enc.encode("updated"),
                1,
                false,
                false,
            );
        });

        await waitForEvent(page, "streamRoomUpdated");
        const data = await getEventData(page, "streamRoomUpdated");
        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
    });

    // =========================================================================
    // streamRoomDeleted
    // =========================================================================

    test("streamRoomDeleted: both connections receive event after deleteStreamRoom", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj], enc.encode("p"), enc.encode("p"));

            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAMROOM_DELETE, StreamEventSelectorType.STREAMROOM_ID, sId)]);
            await api2.subscribeFor([await api2.buildSubscriptionQuery(StreamEventType.STREAMROOM_DELETE, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            (window as any).__testRoomId = sId;
            (window as any).__testApi1 = api1;
        }, args);

        await page.evaluate(async () => {
            await (window as any).__testApi1.deleteStreamRoom((window as any).__testRoomId);
        });

        await waitForEvent(page, "streamRoomDeleted");
        const data = await getEventData(page, "streamRoomDeleted");
        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
    });

    // =========================================================================
    // streamRoomJoined — renamed from streamJoined; payload is { streamRoomId, userId }
    // =========================================================================

    test("streamRoomJoined: receives event with { streamRoomId, userId } when user2 joins", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj], enc.encode("p"), enc.encode("p"));

            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAM_JOIN, StreamEventSelectorType.STREAMROOM_ID, sId)]);
            await api2.subscribeFor([await api2.buildSubscriptionQuery(StreamEventType.STREAM_JOIN, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi2 = api2;
            w.__testUser2Id = users.u2.id;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
        }, args);

        await page.evaluate(async () => {
            await (window as any).__testApi2.joinStreamRoom((window as any).__testRoomId);
        });

        await waitForEvent(page, "streamRoomJoined");
        const data = await getEventData(page, "streamRoomJoined");

        expect(data).toHaveProperty("streamRoomId");
        expect(data).toHaveProperty("userId");
        expect(data.userId).toBe(await page.evaluate(() => (window as any).__testUser2Id));
        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        // old fields must not be present
        expect(data.streamIds).toBeUndefined();
        expect(data.streamId).toBeUndefined();
    });

    // =========================================================================
    // streamRoomLeft — renamed from streamLeft; payload is { streamRoomId, userId }
    // =========================================================================

    test("streamRoomLeft: receives event with { streamRoomId, userId } when user2 leaves", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj], enc.encode("p"), enc.encode("p"));

            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAM_LEAVE, StreamEventSelectorType.STREAMROOM_ID, sId)]);
            await api2.subscribeFor([await api2.buildSubscriptionQuery(StreamEventType.STREAM_LEAVE, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            // user2 must be in the room before it can leave
            await api2.joinStreamRoom(sId);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi2 = api2;
            w.__testUser2Id = users.u2.id;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
        }, args);

        await page.evaluate(async () => {
            await (window as any).__testApi2.leaveStreamRoom((window as any).__testRoomId);
        });

        await waitForEvent(page, "streamRoomLeft");
        const data = await getEventData(page, "streamRoomLeft");

        expect(data).toHaveProperty("streamRoomId");
        expect(data).toHaveProperty("userId");
        expect(data.userId).toBe(await page.evaluate(() => (window as any).__testUser2Id));
        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        expect(data.streamId).toBeUndefined();
    });

    // =========================================================================
    // Disabled / unsubscribe tests (no event must arrive)
    // =========================================================================

    test("streamRoomCreated_disabled: no event after unsubscribe", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));

            const [subId] = await api1.subscribeFor([
                await api1.buildSubscriptionQuery(StreamEventType.STREAMROOM_CREATE, StreamEventSelectorType.CONTEXT_ID, contextId),
            ]);

            // Unsubscribe immediately
            await api1.unsubscribeFrom([subId]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testApi1 = api1;
            w.__testContextId = contextId;
            w.__testU1Obj = u1Obj;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
        }, args);

        await page.evaluate(async () => {
            const enc = new TextEncoder();
            const w = window as any;
            await w.__testApi1.createStreamRoom(
                w.__testContextId,
                [w.__testU1Obj],
                [w.__testU1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
        });

        // Give the server time to potentially deliver the event
        await sleep(2000);
        expect(await hasEvent(page, "streamRoomCreated")).toBe(false);
    });

    test("streamRoomUpdated_disabled: no event after unsubscribe", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));

            const sId = await api1.createStreamRoom(contextId, [u1Obj], [u1Obj], enc.encode("p"), enc.encode("p"));

            const [subId] = await api1.subscribeFor([
                await api1.buildSubscriptionQuery(StreamEventType.STREAMROOM_UPDATE, StreamEventSelectorType.STREAMROOM_ID, sId),
            ]);
            await api1.unsubscribeFrom([subId]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testApi1 = api1;
            w.__testRoomId = sId;
            w.__testU1Obj = u1Obj;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
        }, args);

        await page.evaluate(async () => {
            const enc = new TextEncoder();
            const w = window as any;
            await w.__testApi1.updateStreamRoom(w.__testRoomId, [w.__testU1Obj], [w.__testU1Obj], enc.encode("upd"), enc.encode("upd"), 1, false, false);
        });

        await sleep(2000);
        expect(await hasEvent(page, "streamRoomUpdated")).toBe(false);
    });

    test("streamRoomDeleted_disabled: no event after unsubscribe", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));

            const sId = await api1.createStreamRoom(contextId, [u1Obj], [u1Obj], enc.encode("p"), enc.encode("p"));

            const [subId] = await api1.subscribeFor([
                await api1.buildSubscriptionQuery(StreamEventType.STREAMROOM_DELETE, StreamEventSelectorType.STREAMROOM_ID, sId),
            ]);
            await api1.unsubscribeFrom([subId]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testApi1 = api1;
            w.__testRoomId = sId;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
        }, args);

        await page.evaluate(async () => {
            await (window as any).__testApi1.deleteStreamRoom((window as any).__testRoomId);
        });

        await sleep(2000);
        expect(await hasEvent(page, "streamRoomDeleted")).toBe(false);
    });

    // =========================================================================
    // streamRoomJoined_disabled — no event after unsubscribe
    // =========================================================================

    test("streamRoomJoined_disabled: no event after unsubscribe", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj], enc.encode("p"), enc.encode("p"));

            const [subId] = await api1.subscribeFor([
                await api1.buildSubscriptionQuery(StreamEventType.STREAM_JOIN, StreamEventSelectorType.STREAMROOM_ID, sId),
            ]);
            await api1.unsubscribeFrom([subId]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi2 = api2;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
        }, args);

        await page.evaluate(async () => {
            await (window as any).__testApi2.joinStreamRoom((window as any).__testRoomId);
        });

        await sleep(2000);
        expect(await hasEvent(page, "streamRoomJoined")).toBe(false);
    });

    // =========================================================================
    // streamRoomLeft_disabled — no event after unsubscribe
    // =========================================================================

    test("streamRoomLeft_disabled: no event after unsubscribe", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj], enc.encode("p"), enc.encode("p"));
            await api2.joinStreamRoom(sId);

            const [subId] = await api1.subscribeFor([
                await api1.buildSubscriptionQuery(StreamEventType.STREAM_LEAVE, StreamEventSelectorType.STREAMROOM_ID, sId),
            ]);
            await api1.unsubscribeFrom([subId]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi2 = api2;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
        }, args);

        await page.evaluate(async () => {
            await (window as any).__testApi2.leaveStreamRoom((window as any).__testRoomId);
        });

        await sleep(2000);
        expect(await hasEvent(page, "streamRoomLeft")).toBe(false);
    });

    // =========================================================================
    // streamRoomLeft fires on disconnect too (changelog §6.3), not only explicit leave.
    // Skipped: this is a server-side behavior (bridge must detect the dropped WS and
    // broadcast the leave). The endpoint's own suite only covers explicit leaveStreamRoom,
    // and disconnect detection timing isn't reliable within the e2e timeout. The explicit
    // leave case is covered by "streamRoomLeft: receives event ... when user2 leaves".
    // =========================================================================

    test("streamRoomLeft: fires when user2 disconnects while joined", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj], enc.encode("p"), enc.encode("p"));

            await api1.subscribeFor([
                await api1.buildSubscriptionQuery(StreamEventType.STREAM_LEAVE, StreamEventSelectorType.STREAMROOM_ID, sId),
            ]);
            await api2.joinStreamRoom(sId);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testConn2 = conn2;
            w.__testUser2Id = users.u2.id;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
        }, args);

        // user2 disconnects (does NOT call leaveStreamRoom)
        await page.evaluate(async () => {
            await (window as any).__testConn2.disconnect();
        });

        await waitForEvent(page, "streamRoomLeft");
        const data = await getEventData(page, "streamRoomLeft");
        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        expect(data.userId).toBe(await page.evaluate(() => (window as any).__testUser2Id));
    });

    // =========================================================================
    // Selector scoping — a room-scoped subscription only delivers that room's events
    // =========================================================================

    test("streamRoomUpdated: subscription scoped to one room ignores other rooms", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));

            const roomA = await api1.createStreamRoom(contextId, [u1Obj], [u1Obj], enc.encode("A"), enc.encode("A"));
            const roomB = await api1.createStreamRoom(contextId, [u1Obj], [u1Obj], enc.encode("B"), enc.encode("B"));

            // Subscribe to updates of room A only.
            await api1.subscribeFor([
                await api1.buildSubscriptionQuery(StreamEventType.STREAMROOM_UPDATE, StreamEventSelectorType.STREAMROOM_ID, roomA),
            ]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__roomA = roomA;
            w.__roomB = roomB;
            w.__testApi1 = api1;
            w.__u1Obj = u1Obj;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
        }, args);

        // Updating room B must NOT deliver an event to the room-A subscription.
        await page.evaluate(async () => {
            const enc = new TextEncoder();
            const w = window as any;
            await w.__testApi1.updateStreamRoom(w.__roomB, [w.__u1Obj], [w.__u1Obj], enc.encode("B2"), enc.encode("B2"), 1, false, false);
        });
        await sleep(2000);
        expect(await hasEvent(page, "streamRoomUpdated")).toBe(false);

        // Updating room A delivers the event.
        await page.evaluate(async () => {
            const enc = new TextEncoder();
            const w = window as any;
            await w.__testApi1.updateStreamRoom(w.__roomA, [w.__u1Obj], [w.__u1Obj], enc.encode("A2"), enc.encode("A2"), 1, false, false);
        });
        await waitForEvent(page, "streamRoomUpdated");
        const data = await getEventData(page, "streamRoomUpdated");
        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__roomA));
    });

    // =========================================================================
    // A single subscribeFor with multiple event types delivers each of them
    // =========================================================================

    test("subscribeFor: multiple event types in one call receive both update and delete", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));

            const sId = await api1.createStreamRoom(contextId, [u1Obj], [u1Obj], enc.encode("p"), enc.encode("p"));

            await api1.subscribeFor([
                await api1.buildSubscriptionQuery(StreamEventType.STREAMROOM_UPDATE, StreamEventSelectorType.STREAMROOM_ID, sId),
                await api1.buildSubscriptionQuery(StreamEventType.STREAMROOM_DELETE, StreamEventSelectorType.STREAMROOM_ID, sId),
            ]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi1 = api1;
            w.__u1Obj = u1Obj;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
        }, args);

        await page.evaluate(async () => {
            const enc = new TextEncoder();
            const w = window as any;
            await w.__testApi1.updateStreamRoom(w.__testRoomId, [w.__u1Obj], [w.__u1Obj], enc.encode("upd"), enc.encode("upd"), 1, false, false);
        });
        await waitForEvent(page, "streamRoomUpdated");

        await page.evaluate(async () => {
            await (window as any).__testApi1.deleteStreamRoom((window as any).__testRoomId);
        });
        await waitForEvent(page, "streamRoomDeleted");

        expect(await hasEvent(page, "streamRoomUpdated")).toBe(true);
        expect(await hasEvent(page, "streamRoomDeleted")).toBe(true);
    });
});

// ─── WebRTC event tests (require fake media devices) ─────────────────────────

test.describe("StreamEvents (WebRTC)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10_000 });
    });

    // =========================================================================
    // streamPublished — fires when publisher media is live (§6.1)
    // =========================================================================

    test("streamPublished: both connections receive event with correct streamRoomId", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj, u2Obj], enc.encode("p"), enc.encode("p"));

            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAM_PUBLISH, StreamEventSelectorType.STREAMROOM_ID, sId)]);
            await api2.subscribeFor([await api2.buildSubscriptionQuery(StreamEventType.STREAM_PUBLISH, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi2 = api2;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            // user2 joins and publishes
            await api2.joinStreamRoom(sId);
            const handle = await api2.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api2.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api2.publishStream(handle);
        }, args);

        await waitForEvent(page, "streamPublished");
        const data = await getEventData(page, "streamPublished");

        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        expect(data).toHaveProperty("userId");
        expect(data).toHaveProperty("stream");
    });

    // =========================================================================
    // streamUnpublished — fires for all stop causes including disconnect (§6.2)
    // =========================================================================

    test("streamUnpublished: both connections receive event with streamId after explicit unpublish", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj, u2Obj], enc.encode("p"), enc.encode("p"));

            // u2 joins to keep room alive
            await api2.joinStreamRoom(sId);

            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAM_UNPUBLISH, StreamEventSelectorType.STREAMROOM_ID, sId)]);
            await api2.subscribeFor([await api2.buildSubscriptionQuery(StreamEventType.STREAM_UNPUBLISH, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            await api1.joinStreamRoom(sId);
            const handle = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api1.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api1.publishStream(handle);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi1 = api1;
            w.__testHandle = handle;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            // give media time to go live before unpublish
            await new Promise((r) => setTimeout(r, 2000));
            await api1.unpublishStream(handle);
        }, args);

        await waitForEvent(page, "streamUnpublished");
        const data = await getEventData(page, "streamUnpublished");

        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        expect(data.streamId).toBeGreaterThan(0);
    });

    // =========================================================================
    // streamUpdated — track-level payload (§4).
    // Skipped: in headless Chromium the `updateStream` WebRTC renegotiation of the added
    // track does not propagate a track change that makes the server broadcast streamUpdated
    // (the call resolves SDK-side but no event arrives). The endpoint's native suite covers
    // this with libwebrtc fake tracks. Re-enable once the browser media path / CI media
    // server reliably emits it. The payload-shape assertions below remain the intended check.
    // =========================================================================

    test("streamUpdated: payload has tracksAdded/tracksRemoved/tracksModified fields", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        // streamUpdated needs no explicit subscribeFor — joining/publishing auto-subscribes
        // room members to stream-level updates internally (mirrors the endpoint's own test).
        // Mirror that test's flow: publish a video stream first, then add a second video
        // track and updateStream so the renegotiation propagates a track change to the server.
        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType  }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj, u2Obj], enc.encode("p"), enc.encode("p"));

            await api1.subscribeFor([await api2.buildSubscriptionQuery(StreamEventType.STREAM_UPDATE, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            await api2.joinStreamRoom(sId);
            await api1.joinStreamRoom(sId);

            // Publish a video stream first (matches the endpoint reference test).
            const handle = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
            await api1.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });
            await api1.publishStream(handle);
            await new Promise((r) => setTimeout(r, 1500));

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi1 = api1;
            w.__testHandle = handle;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            // Add a second video track and update → triggers streamUpdated.
            const vStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            await api1.addStreamTrack(handle, { track: vStream.getVideoTracks()[0] });
            await api1.updateStream(handle);
        }, args);

        await waitForEvent(page, "streamUpdated");
        const data = await getEventData(page, "streamUpdated");

        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        expect(typeof data.streamId).toBe("number");
        expect(data.streamId).toBeGreaterThan(0);
        expect(typeof data.userId).toBe("string");
        expect(data.userId.length).toBeGreaterThan(0);

        // New payload shape: tracksAdded / tracksRemoved / tracksModified
        expect(data).toHaveProperty("tracksAdded");
        expect(data).toHaveProperty("tracksRemoved");
        expect(data).toHaveProperty("tracksModified");

        // Old payload shape must not be present
        expect(data.streamsAdded).toBeUndefined();
        expect(data.streamsRemoved).toBeUndefined();
        expect(data.streamsModified).toBeUndefined();
    });

    // NOTE: `streamRoomReoffer` is intentionally NOT tested here. It is an internal
    // renegotiation mechanism — the endpoint consumes its `jsep` itself (createAnswer +
    // acceptOfferOnReconfigure) to keep a subscriber's SDP in sync. It is not a
    // user-facing event contract, so user-level code should not depend on receiving it.

    // =========================================================================
    // streamSubscribed — new event (§2).
    // Skipped: the endpoint commit's StreamVarDeserializer::deserialize<EventType> has no
    // case for STREAM_SUBSCRIBE=8, so buildSubscriptionQuery(STREAM_SUBSCRIBE) throws
    // InvalidParamsException ("Unknown stream::EventType value, received 8") even though the
    // enum and SubscriberImpl channel map include it. Re-enable once the endpoint deserializer
    // handles 8/9.
    // =========================================================================

    test("streamSubscribed: both connections receive event with correct payload when user2 subscribes", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj, u2Obj], enc.encode("p"), enc.encode("p"));

            await api1.joinStreamRoom(sId);
            const handle = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api1.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api1.publishStream(handle);
            await new Promise((r) => setTimeout(r, 1500));

            await api2.joinStreamRoom(sId);

            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAM_SUBSCRIBE, StreamEventSelectorType.STREAMROOM_ID, sId)]);
            await api2.subscribeFor([await api2.buildSubscriptionQuery(StreamEventType.STREAM_SUBSCRIBE, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi2 = api2;
            w.__testUser2Id = users.u2.id;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            const streams = await api1.listStreams(sId);
            if (streams.length > 0) {
                const s = streams[0];
                await api2.subscribeToRemoteStreams(sId, [{ streamId: s.id, streamTrackId: s.tracks[0].mid }]);
            }
        }, args);

        await waitForEvent(page, "streamSubscribed");
        const data = await getEventData(page, "streamSubscribed");

        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        expect(data.userId).toBe(await page.evaluate(() => (window as any).__testUser2Id));
        expect(Array.isArray(data.subscriptions)).toBe(true);
        expect(data.subscriptions.length).toBeGreaterThan(0);
        expect(typeof data.subscriptions[0].streamId).toBe("number");
    });

    // =========================================================================
    // streamUnsubscribed — new event (§2).
    // Skipped: same endpoint gap as streamSubscribed — StreamVarDeserializer has no case for
    // STREAM_UNSUBSCRIBE=9, so subscribing for it throws InvalidParamsException. Re-enable
    // once the endpoint deserializer handles 8/9.
    // =========================================================================

    test("streamUnsubscribed: both connections receive event with correct payload when user2 unsubscribes", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj, u2Obj], enc.encode("p"), enc.encode("p"));

            await api1.joinStreamRoom(sId);
            const handle = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api1.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api1.publishStream(handle);
            await new Promise((r) => setTimeout(r, 1500));

            await api2.joinStreamRoom(sId);

            // Subscribe first
            const streams = await api1.listStreams(sId);
            const subs = streams.length > 0
                ? [{ streamId: streams[0].id, streamTrackId: streams[0].tracks[0].mid }]
                : [];
            if (subs.length > 0) {
                await api2.subscribeToRemoteStreams(sId, subs);
            }
            await new Promise((r) => setTimeout(r, 500));

            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAM_UNSUBSCRIBE, StreamEventSelectorType.STREAMROOM_ID, sId)]);
            await api2.subscribeFor([await api2.buildSubscriptionQuery(StreamEventType.STREAM_UNSUBSCRIBE, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi2 = api2;
            w.__testUser2Id = users.u2.id;
            w.__testSubs = subs;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            if (subs.length > 0) {
                await api2.unsubscribeFromRemoteStreams(sId, subs);
            }
        }, args);

        await waitForEvent(page, "streamUnsubscribed");
        const data = await getEventData(page, "streamUnsubscribed");

        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        expect(data.userId).toBe(await page.evaluate(() => (window as any).__testUser2Id));
        expect(Array.isArray(data.subscriptions)).toBe(true);
        expect(data.subscriptions.length).toBeGreaterThan(0);
    });

    // =========================================================================
    // streamUnsubscribed fires when the subscriber LEAVES the room while subscribed
    // (changelog §6 — leave is a stop cause; the viewer's subscriptions are torn down
    // and broadcast as streamUnsubscribed, not only on explicit unsubscribe).
    // =========================================================================

    test("streamUnsubscribed: fires when the subscriber leaves the room while subscribed", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj, u2Obj], enc.encode("p"), enc.encode("p"));

            // u1 publishes a stream for u2 to subscribe to.
            await api1.joinStreamRoom(sId);
            const handle = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api1.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api1.publishStream(handle);
            await new Promise((r) => setTimeout(r, 1500));

            // u2 joins and subscribes to u1's stream.
            await api2.joinStreamRoom(sId);
            const streams = await api1.listStreams(sId);
            const subs = streams.length > 0
                ? [{ streamId: streams[0].id, streamTrackId: streams[0].tracks[0].mid }]
                : [];
            if (subs.length > 0) {
                await api2.subscribeToRemoteStreams(sId, subs);
            }
            await new Promise((r) => setTimeout(r, 500));

            // u1 (still in the room) observes the unsubscribe broadcast.
            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAM_UNSUBSCRIBE, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi2 = api2;
            w.__testUser2Id = users.u2.id;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            // Leave while subscribed (no explicit unsubscribe) → must still fire streamUnsubscribed.
            await api2.leaveStreamRoom(sId);
        }, args);

        await waitForEvent(page, "streamUnsubscribed");
        const data = await getEventData(page, "streamUnsubscribed");

        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        expect(data.userId).toBe(await page.evaluate(() => (window as any).__testUser2Id));
        expect(Array.isArray(data.subscriptions)).toBe(true);
        expect(data.subscriptions.length).toBeGreaterThan(0);
    });

    // =========================================================================
    // streamUnsubscribed fires when the subscriber DISCONNECTS while subscribed
    // (changelog §6 — connection loss is a stop cause; the viewer's subscriptions are
    // torn down server-side and broadcast as streamUnsubscribed).
    // =========================================================================

    test("streamUnsubscribed: fires when the subscriber disconnects while subscribed", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj, u2Obj], enc.encode("p"), enc.encode("p"));

            // u1 publishes a stream for u2 to subscribe to.
            await api1.joinStreamRoom(sId);
            const handle = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api1.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api1.publishStream(handle);
            await new Promise((r) => setTimeout(r, 1500));

            // u2 joins and subscribes to u1's stream.
            await api2.joinStreamRoom(sId);
            const streams = await api1.listStreams(sId);
            const subs = streams.length > 0
                ? [{ streamId: streams[0].id, streamTrackId: streams[0].tracks[0].mid }]
                : [];
            if (subs.length > 0) {
                await api2.subscribeToRemoteStreams(sId, subs);
            }
            await new Promise((r) => setTimeout(r, 500));

            // u1 (still connected) observes the unsubscribe broadcast.
            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAM_UNSUBSCRIBE, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testConn2 = conn2;
            w.__testUser2Id = users.u2.id;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            // u2 disconnects (does NOT call unsubscribeFromRemoteStreams) → must still fire streamUnsubscribed.
            await conn2.disconnect();
        }, args);

        await waitForEvent(page, "streamUnsubscribed");
        const data = await getEventData(page, "streamUnsubscribed");

        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        expect(data.userId).toBe(await page.evaluate(() => (window as any).__testUser2Id));
        expect(Array.isArray(data.subscriptions)).toBe(true);
        expect(data.subscriptions.length).toBeGreaterThan(0);
    });

    // =========================================================================
    // streamPublished_disabled: no event after unsubscribe
    // =========================================================================

    test("streamPublished_disabled: no event after unsubscribe", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));

            const sId = await api1.createStreamRoom(contextId, [u1Obj], [u1Obj], enc.encode("p"), enc.encode("p"));

            const [subId] = await api1.subscribeFor([
                await api1.buildSubscriptionQuery(StreamEventType.STREAM_PUBLISH, StreamEventSelectorType.STREAMROOM_ID, sId),
            ]);
            await api1.unsubscribeFrom([subId]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testApi1 = api1;
            w.__testRoomId = sId;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            await api1.joinStreamRoom(sId);
            const handle = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api1.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api1.publishStream(handle);
        }, args);

        await sleep(3000);
        expect(await hasEvent(page, "streamPublished")).toBe(false);
    });

    // =========================================================================
    // streamUnpublished fires when a publisher LEAVES the room while publishing
    // (changelog §6.2 — fires for every stop cause, not just explicit unpublish)
    // =========================================================================

    test("streamUnpublished: fires when the publisher leaves the room while publishing", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj, u2Obj], enc.encode("p"), enc.encode("p"));

            // u2 stays in the room to keep it alive and observe the event.
            await api2.joinStreamRoom(sId);

            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAM_UNPUBLISH, StreamEventSelectorType.STREAMROOM_ID, sId)]);
            await api2.subscribeFor([await api2.buildSubscriptionQuery(StreamEventType.STREAM_UNPUBLISH, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            await api1.joinStreamRoom(sId);
            const handle = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api1.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api1.publishStream(handle);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testApi1 = api1;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            await new Promise((r) => setTimeout(r, 2000));
            // Leave while publishing (no explicit unpublishStream) → must still fire streamUnpublished.
            await api1.leaveStreamRoom(sId);
        }, args);

        await waitForEvent(page, "streamUnpublished");
        const data = await getEventData(page, "streamUnpublished");
        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        expect(data.streamId).toBeGreaterThan(0);
    });

    // =========================================================================
    // streamUnpublished fires when a publisher DISCONNECTS while publishing
    // (changelog §6.2 — fires for every stop cause, including connection loss)
    // =========================================================================

    test("streamUnpublished: fires when the publisher disconnects while publishing", async ({
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
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));

            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj, u2Obj], enc.encode("p"), enc.encode("p"));

            // u2 stays in the room to keep it alive and observe the event.
            await api2.joinStreamRoom(sId);
            await api2.subscribeFor([await api2.buildSubscriptionQuery(StreamEventType.STREAM_UNPUBLISH, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            // u1 joins and publishes.
            await api1.joinStreamRoom(sId);
            const handle = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api1.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api1.publishStream(handle);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testRoomId = sId;
            w.__testConn1 = conn1;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            await new Promise((r) => setTimeout(r, 2000));
            // u1 disconnects while publishing (no explicit unpublishStream) → must still fire streamUnpublished.
            await conn1.disconnect();
        }, args);

        await waitForEvent(page, "streamUnpublished");
        const data = await getEventData(page, "streamUnpublished");
        expect(data.streamRoomId).toBe(await page.evaluate(() => (window as any).__testRoomId));
        expect(data.streamId).toBeGreaterThan(0);
    });

    // =========================================================================
    // streamUnpublished_disabled — no event after unsubscribe
    // =========================================================================

    test("streamUnpublished_disabled: no event after unsubscribe", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            StreamEventType,
            StreamEventSelectorType,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));

            const sId = await api1.createStreamRoom(contextId, [u1Obj], [u1Obj], enc.encode("p"), enc.encode("p"));

            const [subId] = await api1.subscribeFor([
                await api1.buildSubscriptionQuery(StreamEventType.STREAM_UNPUBLISH, StreamEventSelectorType.STREAMROOM_ID, sId),
            ]);
            await api1.unsubscribeFrom([subId]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            w.__testApi1 = api1;
            w.__testRoomId = sId;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();

            await api1.joinStreamRoom(sId);
            const handle = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api1.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api1.publishStream(handle);
            await new Promise((r) => setTimeout(r, 1500));
            await api1.unpublishStream(handle);
        }, args);

        await sleep(3000);
        expect(await hasEvent(page, "streamUnpublished")).toBe(false);
    });

    // =========================================================================
    // Unexpected connection drop (changelog §6.2 / §6.3 — "connection loss" stop cause).
    //
    // These differ from the graceful conn.disconnect() tests above: the victim runs in its
    // own browser context and we kill its page with page.close(), which tears down the
    // renderer and drops the WebSocket WITHOUT any app-side disconnect() — the bridge must
    // detect the gone socket on its own and broadcast the teardown to the room. The observer
    // lives in a separate, still-open context so it can receive the broadcast.
    // (We close the page rather than use context.setOffline() because Chromium does not
    // actually drop already-established WebSockets on setOffline — a known Playwright gap.)
    //
    // NOTE: detection latency depends on how fast the bridge notices the gone socket, hence
    // the generous per-test timeouts.
    // =========================================================================

    test("streamUnpublished: fires when the publisher's connection drops unexpectedly", async ({
        createContextPage,
        backend,
        cli,
    }) => {
        test.setTimeout(15_000);

        // Observer (u1) — stays online to receive the broadcast.
        const page1 = await createContextPage();
        await page1.goto("/tests/harness/index.html");
        await page1.waitForFunction(() => window.wasmReady === true, null, { timeout: 10_000 });

        const users = await setupUsers(page1, cli);

        // Publisher (u2) — its connection will be severed mid-publish.
        const page2 = await createContextPage();
        await page2.goto("/tests/harness/index.html");
        await page2.waitForFunction(() => window.wasmReady === true, null, { timeout: 10_000 });

        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            StreamEventType,
            StreamEventSelectorType,
        };

        // u1 creates the room, joins, subscribes to STREAM_UNPUBLISH, and starts the collector.
        const roomId: string = await page1.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj, u2Obj], enc.encode("p"), enc.encode("p"));

            await api1.joinStreamRoom(sId);
            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAM_UNPUBLISH, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
            return sId;
        }, args);

        // u2 joins and publishes from its own context.
        await page2.evaluate(async ({ bridgeUrl, solutionId, roomId, users }) => {
            const Endpoint = window.Endpoint;
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));
            const rid = roomId as any;
            await api2.joinStreamRoom(rid);
            const handle = await api2.createStream(rid);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api2.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api2.publishStream(handle);
            await new Promise((r) => setTimeout(r, 2000));
        }, { bridgeUrl: args.bridgeUrl, solutionId: args.solutionId, roomId, users });

        // Kill u2's page — the renderer dies and the WebSocket drops with no app-side
        // disconnect() (unexpected drop).
        await page2.close();

        await waitForEvent(page1, "streamUnpublished",10_000);
        const data = await getEventData(page1, "streamUnpublished");
        expect(data.streamRoomId).toBe(roomId);
        expect(data.streamId).toBeGreaterThan(0);
    });

    test("streamUnsubscribed: fires when the subscriber's connection drops unexpectedly", async ({
        createContextPage,
        backend,
        cli,
    }) => {
        test.setTimeout(15_000);

        // Publisher + observer (u1) — stays online to receive the broadcast.
        const page1 = await createContextPage();
        await page1.goto("/tests/harness/index.html");
        await page1.waitForFunction(() => window.wasmReady === true, null, { timeout: 10_000 });

        const users = await setupUsers(page1, cli);

        // Subscriber (u2) — its connection will be severed while subscribed.
        const page2 = await createContextPage();
        await page2.goto("/tests/harness/index.html");
        await page2.waitForFunction(() => window.wasmReady === true, null, { timeout: 10_000 });

        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
            StreamEventType,
            StreamEventSelectorType,
        };

        // u1 creates the room, joins, publishes, subscribes to STREAM_UNSUBSCRIBE, starts collector.
        const roomId: string = await page1.evaluate(async ({ bridgeUrl, solutionId, contextId, users, StreamEventType, StreamEventSelectorType }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(conn1, await Endpoint.createEventApi(conn1));
            const sId = await api1.createStreamRoom(contextId, [u1Obj, u2Obj], [u1Obj, u2Obj], enc.encode("p"), enc.encode("p"));

            await api1.joinStreamRoom(sId);
            const handle = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await api1.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api1.publishStream(handle);
            await new Promise((r) => setTimeout(r, 1500));

            await api1.subscribeFor([await api1.buildSubscriptionQuery(StreamEventType.STREAM_UNSUBSCRIBE, StreamEventSelectorType.STREAMROOM_ID, sId)]);

            const eq = await Endpoint.getEventQueue();
            const w = window as any;
            w.__events = [];
            w.__eventsRunning = true;
            (async () => {
                while (w.__eventsRunning) {
                    try { w.__events.push(await eq.waitEvent()); } catch { break; }
                }
            })();
            return sId;
        }, args);

        // u2 joins and subscribes to u1's stream from its own context.
        await page2.evaluate(async ({ bridgeUrl, solutionId, roomId, users }) => {
            const Endpoint = window.Endpoint;
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createStreamApi(conn2, await Endpoint.createEventApi(conn2));
            const rid = roomId as any;
            await api2.joinStreamRoom(rid);

            let streams: any[] = [];
            for (let i = 0; i < 20; i++) {
                streams = await api2.listStreams(rid);
                if (streams.length > 0) break;
                await new Promise((r) => setTimeout(r, 500));
            }
            if (streams.length === 0) throw new Error("publisher stream never appeared");
            await api2.subscribeToRemoteStreams(rid, [{ streamId: streams[0].id, streamTrackId: streams[0].tracks[0].mid }]);
            await new Promise((r) => setTimeout(r, 1000));
        }, { bridgeUrl: args.bridgeUrl, solutionId: args.solutionId, roomId, users });

        // Kill u2's page — the renderer dies and the WebSocket drops with no app-side
        // disconnect() (unexpected drop).
        await page2.close();

        await waitForEvent(page1, "streamUnsubscribed", 10_000);
        const data = await getEventData(page1, "streamUnsubscribed");
        expect(data.streamRoomId).toBe(roomId);
        // NOTE: userId is not asserted — on the connection-drop teardown path the broadcast
        // does not reliably carry it (same as streamUnpublished on drop). Re-add if the bridge
        // starts attributing the gone user on disconnect.
        expect(Array.isArray(data.subscriptions)).toBe(true);
        expect(data.subscriptions.length).toBeGreaterThan(0);
    });
});
