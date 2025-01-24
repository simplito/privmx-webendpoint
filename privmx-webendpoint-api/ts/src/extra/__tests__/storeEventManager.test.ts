import {StoreEventsManager } from "../events";
import {MockStoreEventApi } from "./__mocks__/mockEventAPIs";
import {createTestSetup, waitForNextTick} from "./__mocks__/utils";
import {MOCK_STORE_CREATED_EVENT, MOCK_STORE_FILE_DELETED_EVENT} from "./__mocks__/constants";

describe('Store event manager', () => {
    let { q, manager } = createTestSetup();
    let mockEventsManager: StoreEventsManager = manager.getStoreEventManager(
        new MockStoreEventApi(q)
    );

    beforeEach(() => {
        let { q: _q, manager } = createTestSetup();
        q = _q;
        mockEventsManager = manager.getStoreEventManager(
            new MockStoreEventApi(q)
        );
    });

    it('should add callback for event', async () => {
        await mockEventsManager.onStoreEvent({
            event: 'storeStatsChanged',
            callback: () => {}
        });
        expect(mockEventsManager.listeners.size).toBe(1);
    });

    it('should function to remove callback from event', async () => {
        const removeListener = await mockEventsManager.onStoreEvent({
            event: 'storeStatsChanged',
            callback: () => {}
        });
        expect(mockEventsManager.listeners.size).toBe(1);
        await removeListener();
        expect(mockEventsManager.listeners.size).toBe(0);
    });

    it('should register multiple callbacks for channel', async () => {
        const storeEventCb = jest.fn();

        await mockEventsManager.onStoreEvent({ event: MOCK_STORE_CREATED_EVENT.type, callback: storeEventCb });
        await mockEventsManager.onStoreEvent({ event: MOCK_STORE_CREATED_EVENT.type, callback: storeEventCb });

        q.dispatchEvent(MOCK_STORE_CREATED_EVENT);

        //adding task on end of js event loop
        await waitForNextTick()
        expect(storeEventCb).toHaveBeenCalledTimes(2);
    });

    it('should handle subscription for two channels', async () => {
        const storeEventCb = jest.fn();
        const messageEventCb = jest.fn();

        const STORE_ID = '98dsyvs87dybv9a87dyvb98';
        const storeEvent = MOCK_STORE_FILE_DELETED_EVENT(STORE_ID)
        await mockEventsManager.onStoreEvent({ event: MOCK_STORE_CREATED_EVENT.type, callback: storeEventCb });
        await mockEventsManager.onFileEvent(STORE_ID, {
            event: storeEvent.type,
            callback: messageEventCb
        });

        q.dispatchEvent(MOCK_STORE_CREATED_EVENT);
        q.dispatchEvent(storeEvent);

        //adding task on end of js event loop
        await waitForNextTick()
        expect(storeEventCb).toHaveBeenCalledTimes(1);
        expect(messageEventCb).toHaveBeenCalledTimes(1);
    });
});
