import type { Mock } from "vitest";
import { createTestSetup, waitForNextTick } from "../../extra/__mocks__/utils.js";
import {
    createThreadSubscription,
    createStoreSubscription,
    createConnectionSubscription,
    ConnectionStatusEventType,
} from "../subscriptions.js";
import {
    ThreadEventType,
    ThreadEventSelectorType,
    StoreEventType,
    StoreEventSelectorType,
} from "../../Types.js";
import {
    MOCK_THREAD_CREATED_EVENT,
    MOCK_STORE_CREATED_EVENT,
    MOCK_LIB_CONNECTED_EVENT,
} from "../../extra/__mocks__/constants.js";

const threadSub = (callback: Mock) =>
    createThreadSubscription({
        type: ThreadEventType.THREAD_UPDATE,
        selector: ThreadEventSelectorType.CONTEXT_ID,
        id: "",
        callbacks: [callback],
    });

const storeSub = (callback: Mock) =>
    createStoreSubscription({
        type: StoreEventType.STORE_UPDATE,
        selector: StoreEventSelectorType.CONTEXT_ID,
        id: "",
        callbacks: [callback],
    });

describe("EventManager (unified)", () => {
    it("subscribe() returns ids and delivers a thread event to its callback", async () => {
        const { q, manager } = createTestSetup();
        const cb = vi.fn();

        const [id] = await manager.subscribe([threadSub(cb)]);
        expect(typeof id).toBe("string");

        q.dispatchEvent(MOCK_THREAD_CREATED_EVENT(id));
        await waitForNextTick();

        expect(cb).toHaveBeenCalledTimes(1);
    });

    it("routes events to the matching callback across modules in one subscribe() call", async () => {
        const { q, manager } = createTestSetup();
        const threadCb = vi.fn();
        const storeCb = vi.fn();

        const [threadId, storeId] = await manager.subscribe([threadSub(threadCb), storeSub(storeCb)]);

        q.dispatchEvent(MOCK_THREAD_CREATED_EVENT(threadId));
        q.dispatchEvent(MOCK_STORE_CREATED_EVENT(storeId));
        await waitForNextTick();

        expect(threadCb).toHaveBeenCalledTimes(1);
        expect(storeCb).toHaveBeenCalledTimes(1);
    });

    it("normalizes connection-state events and routes them to the callback", async () => {
        const { q, manager } = createTestSetup("1");
        const cb = vi.fn();

        await manager.subscribe([
            createConnectionSubscription({
                type: ConnectionStatusEventType.LIB_CONNECTED,
                callbacks: [cb],
            }),
        ]);

        q.dispatchEvent(MOCK_LIB_CONNECTED_EVENT(1));
        await waitForNextTick();

        expect(cb).toHaveBeenCalledTimes(1);
    });

    it("unsubscribe() stops further delivery", async () => {
        const { q, manager } = createTestSetup();
        const cb = vi.fn();

        const [id] = await manager.subscribe([threadSub(cb)]);
        q.dispatchEvent(MOCK_THREAD_CREATED_EVENT(id));
        await waitForNextTick();
        expect(cb).toHaveBeenCalledTimes(1);

        await manager.unsubscribe([id]);
        q.dispatchEvent(MOCK_THREAD_CREATED_EVENT(id));
        await waitForNextTick();
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it("unsubscribe() with unknown ids is a no-op", async () => {
        const { manager } = createTestSetup();
        await expect(manager.unsubscribe(["does-not-exist"])).resolves.toBeUndefined();
    });

    it("stopping the loop halts delivery", async () => {
        const { q, loop, manager } = createTestSetup();
        const cb = vi.fn();

        const [id] = await manager.subscribe([threadSub(cb)]);
        loop.stop();

        q.dispatchEvent(MOCK_THREAD_CREATED_EVENT(id));
        await waitForNextTick();

        expect(cb).not.toHaveBeenCalled();
    });
});
