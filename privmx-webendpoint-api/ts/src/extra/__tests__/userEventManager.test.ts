import { Types } from "../../index";
import {
  MOCK_CONNECTION_USER_ADDED_EVENT,
  MOCK_CONNECTION_USER_STATUS_EVENT,
} from "../__mocks__/constants";
import { MockContainerSubscriber } from "../__mocks__/mockContainerSubscriber";
import { createTestSetup, waitForNextTick } from "../__mocks__/utils";
import { UserEventsManager } from "../managers";
import { createUserEventSubscription } from "../subscriptions";

describe("User event manager", () => {
  let { q, manager } = createTestSetup();
  let userEventsManager: UserEventsManager;

  beforeEach(() => {
    let { q: _q, manager: _manager } = createTestSetup();
    q = _q;
    manager = _manager;
    userEventsManager = manager.getUserEventsManager(
      new MockContainerSubscriber<
        Types.ConnectionEventType,
        Types.ConnectionEventSelectorType
      >(q),
    );
  });

  it("dispatches user events to registered callbacks", async () => {
    const callback = jest.fn();

    const subscription = createUserEventSubscription({
      type: Types.ConnectionEventType.USER_ADD,
      selector: Types.ConnectionEventSelectorType.CONTEXT_ID,
      id: "ctx-1",
      callbacks: [callback],
    });

    const [subscriptionId] = await userEventsManager.subscribeFor([
      subscription,
    ]);

    q.dispatchEvent(MOCK_CONNECTION_USER_ADDED_EVENT(subscriptionId));

    await waitForNextTick();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].data).toEqual({
      contextId: "ctx-1",
      user: { userId: "user-1", pubKey: "pub-1" },
    });
  });

  it("stops invoking callbacks after unsubscribe", async () => {
    const callback = jest.fn();

    const subscription = createUserEventSubscription({
      type: Types.ConnectionEventType.USER_STATUS,
      selector: Types.ConnectionEventSelectorType.CONTEXT_ID,
      id: "ctx-1",
      callbacks: [callback],
    });

    const [subscriptionId] = await userEventsManager.subscribeFor([
      subscription,
    ]);

    await userEventsManager.unsubscribeFrom([subscriptionId]);

    q.dispatchEvent(MOCK_CONNECTION_USER_STATUS_EVENT(subscriptionId));

    await waitForNextTick();

    expect(callback).not.toHaveBeenCalled();
  });
});
