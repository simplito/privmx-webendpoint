import {  ThreadEventsManager } from '../events';
import { MockThreadEventApi } from './__mocks__/mockEventAPIs';
import {createTestSetup, waitForNextTick} from './__mocks__/utils';
import {
    MOCK_THREAD_CREATED_EVENT,
    MOCK_THREAD_MESSAGE_DELETED_EVENT
} from "./__mocks__/constants";

describe('Thread event manager', () => {
    let { q, manager } = createTestSetup();
    let mockEventsManager: ThreadEventsManager = manager.getThreadEventManager(
        new MockThreadEventApi(q)
    );

    beforeEach(() => {
        let { q: _q, manager } = createTestSetup();
        q = _q;
        mockEventsManager = manager.getThreadEventManager(new MockThreadEventApi(q));
    });

    it('should create manager', async () => {
        expect(mockEventsManager).toBeDefined()
        expect(manager.dispatchers.length).toBe(1);
    });

    it('should add callback for event', async () => {
        await mockEventsManager.onThreadEvent({
            event: 'threadStatsChanged',
            callback: () => {}
        });
        expect(mockEventsManager.listeners.size).toBe(1);
    });

    it('should function to remove callback from event', async () => {
        const removeListener = await mockEventsManager.onThreadEvent({
            event: 'threadStatsChanged',
            callback: () => {}
        });
        expect(mockEventsManager.listeners.size).toBe(1);
        await removeListener();
        expect(mockEventsManager.listeners.size).toBe(0);
    });

    it('should register multiple callbacks for channel', async () => {

        const threadEventCb = jest.fn();

        await mockEventsManager.onThreadEvent({ event: MOCK_THREAD_CREATED_EVENT.type, callback: threadEventCb });
        await mockEventsManager.onThreadEvent({ event: MOCK_THREAD_CREATED_EVENT.type, callback: threadEventCb });

        q.dispatchEvent(MOCK_THREAD_CREATED_EVENT);

        //adding task on end of js event loop
        await waitForNextTick()
        expect(threadEventCb).toHaveBeenCalledTimes(2);
    });

    it('should handle subscription for two channels', async () => {
        const threadEventCb = jest.fn();
        const messageEventCb = jest.fn();

        const THREAD_ID = '823yrcby32987yc23984b7y3w';
        const threadEvent = MOCK_THREAD_MESSAGE_DELETED_EVENT(THREAD_ID)
        await mockEventsManager.onThreadEvent({ event: MOCK_THREAD_CREATED_EVENT.type, callback: threadEventCb });
        await mockEventsManager.onMessageEvent(THREAD_ID, {
            event: threadEvent.type,
            callback: messageEventCb
        });

        q.dispatchEvent(MOCK_THREAD_CREATED_EVENT);
        q.dispatchEvent(threadEvent);

        //adding task on end of js event loop
        await waitForNextTick()
        expect(threadEventCb).toHaveBeenCalledTimes(1);
        expect(messageEventCb).toHaveBeenCalledTimes(1);
    });
});
