import { createTestSetup } from "../__mocks__/utils";
import { ThreadEventsManager } from "../managers";
import { createThreadSubscription } from "../subscriptions";
import { ThreadEventSelectorType, ThreadEventType } from "../../Types";
import { MockContainerSubscriber } from "../__mocks__/mockContainerSubscriber";
import { createBaseEvent } from "../__mocks__/constants";

describe("Events Helpers", () => {
  let { q, manager } = createTestSetup();
  let mockEventsManager = new ThreadEventsManager(
    new MockContainerSubscriber(q),
  );
  manager.registerDispatcher(mockEventsManager);

  beforeEach(() => {
    let { q: _q, manager: _m } = createTestSetup();
    q = _q;
    manager = _m;
    mockEventsManager = new ThreadEventsManager(new MockContainerSubscriber(q));
    manager.registerDispatcher(mockEventsManager);
  });

  it("should registered dispatchers", () => {
    expect(manager.dispatchers.length).toBe(1);
  });

  it("should call callback for matching event", async () => {
    const cb = jest.fn();

    const sub = createThreadSubscription({
      type: ThreadEventType.THREAD_STATS,
      selector: ThreadEventSelectorType.CONTEXT_ID,
      id: "",
      callbacks: [cb],
    });

    const [subId] = await mockEventsManager.subscribeFor([sub]);

    q.dispatchEvent({
      ...createBaseEvent(subId),
      type: "threadStatsChanged",
      channel: "thread",
    });

    //adding task on end of js event loop
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb).toHaveBeenCalled();
        resolve();
      }, 0);
    });
  });

  it("should receive multiple events", async () => {
    const cb = jest.fn();

    const sub = createThreadSubscription({
      type: ThreadEventType.THREAD_STATS,
      selector: ThreadEventSelectorType.CONTEXT_ID,
      id: "",
      callbacks: [cb],
    });

    const [subId] = await mockEventsManager.subscribeFor([sub]);

    q.dispatchEvent({
      ...createBaseEvent(subId),
      type: "threadStatsChanged",
      channel: "thread",
    });
    q.dispatchEvent({
      ...createBaseEvent(subId),
      type: "threadStatsChanged",
      channel: "thread",
    });
    //adding task on end of js event loop
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb).toHaveBeenCalledTimes(2);
        resolve();
      }, 0);
    });

    q.dispatchEvent({
      ...createBaseEvent(subId),
      type: "threadStatsChanged",
      channel: "thread",
    });
    //adding task on end of js event loop
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb).toHaveBeenCalledTimes(3);
        resolve();
      }, 0);
    });
  });
});
