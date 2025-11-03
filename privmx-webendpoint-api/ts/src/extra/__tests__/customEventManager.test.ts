import { Types } from "../../index";
import {
  MOCK_CUSTOM_EVENT,
} from "../__mocks__/constants";
import { MockContainerSubscriber } from "../__mocks__/mockContainerSubscriber";
import { createTestSetup, waitForNextTick } from "../__mocks__/utils";
import { createEventSubscription } from "../subscriptions";

describe("Custom event manager", () => {
  let { q, manager } = createTestSetup();
  let customEventsManager = manager.getCustomEventManager(
    new MockContainerSubscriber<string, Types.EventsEventSelectorType>(q),
  );

  beforeEach(() => {
    let { q: _q, manager: _manager } = createTestSetup();
    q = _q;
    manager = _manager;
    customEventsManager = _manager.getCustomEventManager(
      new MockContainerSubscriber<string, Types.EventsEventSelectorType>(q),
    );
  });

  it("dispatches custom events to registered callbacks", async () => {
    const subscriber =
      new MockContainerSubscriber<string, Types.EventsEventSelectorType>(q);
    const buildQuerySpy = jest
      .spyOn(subscriber, "buildSubscriptionQuery")
      .mockImplementation(async (channel, selector, selectorId) => {
        expect(channel).toBe("custom-channel");
        expect(selector).toBe(Types.EventsEventSelectorType.CONTEXT_ID);
        expect(selectorId).toBe("ctx-1");
        return `${channel}|${selectorId}`;
      });

    const managerWithSpy = manager.getCustomEventManager(subscriber);

    const callback = jest.fn();

    const subscription = createEventSubscription({
      channel: "custom-channel",
      selector: Types.EventsEventSelectorType.CONTEXT_ID,
      id: "ctx-1",
      callbacks: [callback],
    });

    const [subscriptionId] = await managerWithSpy.subscribeFor([subscription]);

    expect(buildQuerySpy).toHaveBeenCalled();

    q.dispatchEvent(MOCK_CUSTOM_EVENT(subscriptionId));

    await waitForNextTick();

    expect(callback).toHaveBeenCalledTimes(1);
    const eventArg = callback.mock.calls[0][0];
    expect(eventArg.data).toEqual({
      contextId: "ctx-1",
      userId: "user-1",
      payload: new Uint8Array([1, 2, 3]),
      statusCode: 0,
      schemaVersion: 5,
    });
  });

  it("stops invoking callbacks after unsubscribe", async () => {
    const callback = jest.fn();

    const subscription = createEventSubscription({
      channel: "custom-channel",
      selector: Types.EventsEventSelectorType.CONTEXT_ID,
      id: "ctx-1",
      callbacks: [callback],
    });

    const [subscriptionId] = await customEventsManager.subscribeFor([
      subscription,
    ]);

    await customEventsManager.unsubscribeFrom([subscriptionId]);

    q.dispatchEvent(MOCK_CUSTOM_EVENT(subscriptionId));

    await waitForNextTick();

    expect(callback).not.toHaveBeenCalled();
  });
});
