import { Types } from "../../index";
import {
  MOCK_CONNECTION_USER_ADDED_EVENT,
  MOCK_CONNECTION_USER_STATUS_EVENT,
  MOCK_LIB_CONNECTED_EVENT,
} from "../__mocks__/constants";
import { MockContainerSubscriber } from "../__mocks__/mockContainerSubscriber";
import { createTestSetup, waitForNextTick } from "../__mocks__/utils";
import { ConnectionEventsManager } from "../managers";
import {
  ConnectionLibEventType,
  createConnectionSubscription,
} from "../subscriptions";

describe("Connection event manager", () => {
  let { q, manager } = createTestSetup();
  let connectionEventsManager: ConnectionEventsManager;

  beforeEach(() => {
    let { q: _q, manager: _manager } = createTestSetup();
    q = _q;
    manager = _manager;
    connectionEventsManager = manager.getConnectionEventManager(
      new MockContainerSubscriber<
        Types.ConnectionEventType,
        Types.ConnectionEventSelectorType
      >(q),
      "1",
    );
  });

  it("dispatches remote connection events to registered callbacks", async () => {
    const callback = jest.fn();

    const remoteSubscription = createConnectionSubscription({
      type: Types.ConnectionEventType.USER_ADD,
      selector: Types.ConnectionEventSelectorType.CONTEXT_ID,
      id: "ctx-1",
      callbacks: [callback],
    });

    const [subscriptionId] = await connectionEventsManager.subscribeFor([
      remoteSubscription,
    ]);

    q.dispatchEvent(MOCK_CONNECTION_USER_ADDED_EVENT(subscriptionId));

    await waitForNextTick();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].data).toEqual({
      contextId: "ctx-1",
      user: { userId: "user-1", pubKey: "pub-1" },
    });
  });

  it("stops invoking callbacks after remote unsubscribe", async () => {
    const callback = jest.fn();

    const remoteSubscription = createConnectionSubscription({
      type: Types.ConnectionEventType.USER_STATUS,
      selector: Types.ConnectionEventSelectorType.CONTEXT_ID,
      id: "ctx-1",
      callbacks: [callback],
    });

    const [subscriptionId] = await connectionEventsManager.subscribeFor([
      remoteSubscription,
    ]);

    await connectionEventsManager.unsubscribeFrom([subscriptionId]);

    q.dispatchEvent(MOCK_CONNECTION_USER_STATUS_EVENT(subscriptionId));

    await waitForNextTick();

    expect(callback).not.toHaveBeenCalled();
  });

  it("supports legacy lib connection events", async () => {
    const callback = jest.fn();

    const libSubscription = createConnectionSubscription({
      type: ConnectionLibEventType.LIB_CONNECTED,
      callbacks: [callback],
    });

    const [libSubscriptionId] = await connectionEventsManager.subscribeFor([
      libSubscription,
    ]);

    expect(libSubscriptionId).toBe("1/channel/lib_connected");

    q.dispatchEvent(MOCK_LIB_CONNECTED_EVENT(1));

    await waitForNextTick();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
