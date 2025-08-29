import { createTestSetup, waitForNextTick } from "../__mocks__/utils";
import { MockContainerSubscriber } from "../__mocks__/mockContainerSubscriber";
import { ThreadEventsManager } from "../managers";
import { createThreadSubscription } from "../subscriptions";
import { ThreadEventSelectorType, ThreadEventType } from "../../Types";
import {
  MOCK_THREAD_CREATED_EVENT,
  MOCK_THREAD_MESSAGE_DELETED_EVENT,
} from "../__mocks__/constants";

describe("Thread event manager", () => {
  let { q, manager } = createTestSetup();
  let mockEventsManager: ThreadEventsManager = manager.getThreadEventManager(
    new MockContainerSubscriber(q),
  );

  beforeEach(() => {
    let { q: _q, manager } = createTestSetup();
    q = _q;
    mockEventsManager = manager.getThreadEventManager(
      new MockContainerSubscriber(q),
    );
  });

  it("should create manager", async () => {
    expect(mockEventsManager).toBeDefined();
    expect(manager.dispatchers.length).toBe(1);
  });

  it("should add callback for event", async () => {
    const sub = createThreadSubscription({
      type: ThreadEventType.THREAD_UPDATE,
      id: "",
      selector: ThreadEventSelectorType.CONTEXT_ID,
      callbacks: [() => {}],
    });
    await mockEventsManager.subscribeFor([sub]);
    expect(mockEventsManager.listeners.size).toBe(1);
  });

  it("should function to remove callback from event", async () => {
    const sub = createThreadSubscription({
      type: ThreadEventType.THREAD_UPDATE,
      id: "",
      selector: ThreadEventSelectorType.CONTEXT_ID,
      callbacks: [() => {}],
    });

    const [subId] = await mockEventsManager.subscribeFor([sub]);
    expect(mockEventsManager.listeners.size).toBe(1);
    await mockEventsManager.unsubscribeFrom([subId]);
    expect(mockEventsManager.listeners.size).toBe(0);
  });

  it("should register multiple callbacks for channel", async () => {
    const threadEventCb = jest.fn();

    const sub = createThreadSubscription({
      type: ThreadEventType.THREAD_UPDATE,
      id: "",
      selector: ThreadEventSelectorType.CONTEXT_ID,
      callbacks: [threadEventCb, threadEventCb],
    });

    const [subId] = await mockEventsManager.subscribeFor([sub]);

    q.dispatchEvent(MOCK_THREAD_CREATED_EVENT(subId));

    //adding task on end of js event loop
    await waitForNextTick();
    expect(threadEventCb).toHaveBeenCalledTimes(2);
  });

  it("should handle subscription for two channels", async () => {
    const threadEventCb = jest.fn();
    const messageEventCb = jest.fn();

    const THREAD_ID = "98dsyvs87dybv9a87dyvb98";

    const subA = createThreadSubscription({
      type: ThreadEventType.THREAD_CREATE,
      id: "",
      selector: ThreadEventSelectorType.CONTEXT_ID,
      callbacks: [threadEventCb],
    });

    const subB = createThreadSubscription({
      type: ThreadEventType.MESSAGE_DELETE,
      id: THREAD_ID,
      selector: ThreadEventSelectorType.THREAD_ID,
      callbacks: [messageEventCb],
    });

    const [subIdA, subIdB] = await mockEventsManager.subscribeFor([subA, subB]);

    q.dispatchEvent(MOCK_THREAD_CREATED_EVENT(subIdA));
    q.dispatchEvent(MOCK_THREAD_MESSAGE_DELETED_EVENT(THREAD_ID, subIdB));

    //adding task on end of js event loop
    await waitForNextTick();
    expect(threadEventCb).toHaveBeenCalledTimes(1);
    expect(messageEventCb).toHaveBeenCalledTimes(1);
  });
});
