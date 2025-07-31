import {MockInboxEventApi } from "./__mocks__/mockEventAPIs";
import {createTestSetup, waitForNextTick} from "./__mocks__/utils";
import {MOCK_INBOX_CREATED_EVENT, MOCK_INBOX_ENTRY_DELETED_EVENT} from "./__mocks__/constants";

describe('Inbox event manager', () => {
    let { q, manager } = createTestSetup();
    const TEST_CONTEXT_ID = 'test-context-id';
    let mockEventsManager = manager.getInboxEventManager(
        new MockInboxEventApi(q),
        TEST_CONTEXT_ID
    );

    beforeEach(() => {
        let { q: _q, manager } = createTestSetup();
        q = _q;
        mockEventsManager = manager.getInboxEventManager(new MockInboxEventApi(q), TEST_CONTEXT_ID);
    });

    it('should add callback for event', async () => {
        await mockEventsManager.onInboxEvent({
            event: 'inboxUpdated',
            callback: () => {}
        });
        expect(mockEventsManager.listeners.size).toBe(1);
    });

    it('should function to remove callback from event', async () => {
        const removeListener = await mockEventsManager.onInboxEvent({
            event: 'inboxUpdated',
            callback: () => {}
        });
        expect(mockEventsManager.listeners.size).toBe(1);
        await removeListener();
        expect(mockEventsManager.listeners.size).toBe(0);
    });

    it('should register multiple callbacks for channel', async () => {
        const storeEventCb = jest.fn();

        await mockEventsManager.onInboxEvent({ event: MOCK_INBOX_CREATED_EVENT.type, callback: storeEventCb });
        await mockEventsManager.onInboxEvent({ event: MOCK_INBOX_CREATED_EVENT.type, callback: storeEventCb });

        q.dispatchEvent(MOCK_INBOX_CREATED_EVENT);

        //adding task on end of js event loop
        await waitForNextTick()
        expect(storeEventCb).toHaveBeenCalledTimes(2);
    });

    it('should handle subscription for two channels', async () => {
        const storeEventCb = jest.fn();
        const messageEventCb = jest.fn();

        const inboxId = "98dsyvb8as7ybd0asydvb0as"
        const event = MOCK_INBOX_ENTRY_DELETED_EVENT(inboxId)

        await mockEventsManager.onInboxEvent({ event: MOCK_INBOX_CREATED_EVENT.type, callback: storeEventCb });
        await mockEventsManager.onEntryEvent(inboxId, {
            event:event.type,
            callback: messageEventCb
        });

        q.dispatchEvent(MOCK_INBOX_CREATED_EVENT);
        q.dispatchEvent(event);

        //adding task on end of js event loop
        await waitForNextTick()
        expect(storeEventCb).toHaveBeenCalledTimes(1);
        expect(messageEventCb).toHaveBeenCalledTimes(1);

    });
});
