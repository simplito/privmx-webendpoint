import { createTestSetup, waitForNextTick } from "../__mocks__/utils";
import {
  MOCK_INBOX_CREATED_EVENT,
  MOCK_INBOX_ENTRY_DELETED_EVENT,
} from "../__mocks__/constants";
import { createInboxSubscription } from "../subscriptions";
import { InboxEventSelectorType, InboxEventType } from "../../Types";
import { MockContainerSubscriber } from "../__mocks__/mockContainerSubscriber";

describe("Inbox event manager", () => {
  let { q, manager } = createTestSetup();
  let mockEventsManager = manager.getInboxEventManager(
    new MockContainerSubscriber(q),
  );

  beforeEach(() => {
    let { q: _q, manager } = createTestSetup();
    q = _q;
    mockEventsManager = manager.getInboxEventManager(
      new MockContainerSubscriber(q),
    );
  });

  it("should add callback for event", async () => {
    const sub = createInboxSubscription({
      type: InboxEventType.INBOX_UPDATE,
      id: "",
      selector: InboxEventSelectorType.CONTEXT_ID,
      callbacks: [() => {}],
    });

    await mockEventsManager.subscribeFor([sub]);
    expect(mockEventsManager.listeners.size).toBe(1);
  });

  it("should function to remove callback from event", async () => {
    const sub = createInboxSubscription({
      type: InboxEventType.INBOX_UPDATE,
      id: "",
      selector: InboxEventSelectorType.CONTEXT_ID,
      callbacks: [() => {}],
    });

    const [subId] = await mockEventsManager.subscribeFor([sub]);

    expect(mockEventsManager.listeners.size).toBe(1);
    await mockEventsManager.unsubscribeFrom([subId]);
    expect(mockEventsManager.listeners.size).toBe(0);
  });

  it("should register multiple callbacks for channel", async () => {
    const storeEventCb = jest.fn();

    const sub = createInboxSubscription({
      type: InboxEventType.INBOX_UPDATE,
      id: "",
      selector: InboxEventSelectorType.CONTEXT_ID,
      callbacks: [storeEventCb, storeEventCb],
    });

    const [subId] = await mockEventsManager.subscribeFor([sub]);

    q.dispatchEvent(MOCK_INBOX_CREATED_EVENT(subId));

    //adding task on end of js event loop
    await waitForNextTick();
    expect(storeEventCb).toHaveBeenCalledTimes(2);
  });

  it("should handle subscription for two channels", async () => {
    const inboxEventCb = jest.fn();
    const entryEventCb = jest.fn();

    const inboxId = "98dsyvb8as7ybd0asydvb0as";

    const subA = createInboxSubscription({
      type: InboxEventType.INBOX_CREATE,
      id: "",
      selector: InboxEventSelectorType.CONTEXT_ID,
      callbacks: [inboxEventCb],
    });

    const subB = createInboxSubscription({
      type: InboxEventType.ENTRY_DELETE,
      id: inboxId,
      selector: InboxEventSelectorType.INBOX_ID,
      callbacks: [entryEventCb],
    });

    const [subIdA, subIdB] = await mockEventsManager.subscribeFor([subA, subB]);

    const event = MOCK_INBOX_ENTRY_DELETED_EVENT(inboxId, subIdB);
    const eventCreated = MOCK_INBOX_CREATED_EVENT(subIdA);
    q.dispatchEvent(eventCreated);

    await waitForNextTick();
    q.dispatchEvent(event);

    //adding task on end of js event loop
    await waitForNextTick();
    expect(inboxEventCb).toHaveBeenCalledTimes(1);
    expect(entryEventCb).toHaveBeenCalledTimes(1);
  });
});
