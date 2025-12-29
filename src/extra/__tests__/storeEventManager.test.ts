import { createTestSetup, waitForNextTick } from "../__mocks__/utils";
import {
  MOCK_STORE_CREATED_EVENT,
  MOCK_STORE_FILE_DELETED_EVENT,
} from "../__mocks__/constants";
import { MockContainerSubscriber } from "../__mocks__/mockContainerSubscriber";
import { StoreEventsManager } from "../managers";
import { createStoreSubscription } from "../subscriptions";
import { StoreEventSelectorType, StoreEventType } from "../../Types";

describe("Store event manager", () => {
  let { q, manager } = createTestSetup();
  let mockEventsManager: StoreEventsManager = manager.getStoreEventManager(
    new MockContainerSubscriber(q),
  );

  beforeEach(() => {
    let { q: _q, manager } = createTestSetup();
    q = _q;
    mockEventsManager = manager.getStoreEventManager(
      new MockContainerSubscriber(q),
    );
  });

  it("should add callback for event", async () => {
    const sub = createStoreSubscription({
      type: StoreEventType.STORE_UPDATE,
      id: "",
      selector: StoreEventSelectorType.CONTEXT_ID,
      callbacks: [() => {}],
    });
    await mockEventsManager.subscribeFor([sub]);
    expect(mockEventsManager.listeners.size).toBe(1);
  });

  it("should function to remove callback from event", async () => {
    const sub = createStoreSubscription({
      type: StoreEventType.STORE_UPDATE,
      id: "",
      selector: StoreEventSelectorType.CONTEXT_ID,
      callbacks: [() => {}],
    });

    const [subId] = await mockEventsManager.subscribeFor([sub]);
    expect(mockEventsManager.listeners.size).toBe(1);
    await mockEventsManager.unsubscribeFrom([subId]);
    expect(mockEventsManager.listeners.size).toBe(0);
  });

  it("should register multiple callbacks for channel", async () => {
    const storeEventCb = jest.fn();

    const sub = createStoreSubscription({
      type: StoreEventType.STORE_UPDATE,
      id: "",
      selector: StoreEventSelectorType.CONTEXT_ID,
      callbacks: [storeEventCb, storeEventCb],
    });

    const [subId] = await mockEventsManager.subscribeFor([sub]);

    q.dispatchEvent(MOCK_STORE_CREATED_EVENT(subId));

    //adding task on end of js event loop
    await waitForNextTick();
    expect(storeEventCb).toHaveBeenCalledTimes(2);
  });

  it("should handle subscription for two channels", async () => {
    const storeEventCb = jest.fn();
    const messageEventCb = jest.fn();

    const STORE_ID = "98dsyvs87dybv9a87dyvb98";

    const subA = createStoreSubscription({
      type: StoreEventType.STORE_CREATE,
      id: "",
      selector: StoreEventSelectorType.CONTEXT_ID,
      callbacks: [storeEventCb],
    });

    const subB = createStoreSubscription({
      type: StoreEventType.FILE_DELETE,
      id: STORE_ID,
      selector: StoreEventSelectorType.STORE_ID,
      callbacks: [messageEventCb],
    });

    const [subIdA, subIdB] = await mockEventsManager.subscribeFor([subA, subB]);

    q.dispatchEvent(MOCK_STORE_CREATED_EVENT(subIdA));
    q.dispatchEvent(MOCK_STORE_FILE_DELETED_EVENT(STORE_ID, subIdB));

    //adding task on end of js event loop
    await waitForNextTick();
    expect(storeEventCb).toHaveBeenCalledTimes(1);
    expect(messageEventCb).toHaveBeenCalledTimes(1);
  });
});
