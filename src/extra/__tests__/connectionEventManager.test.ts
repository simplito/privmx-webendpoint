import { MOCK_LIB_CONNECTED_EVENT } from "../__mocks__/constants";
import { createTestSetup, waitForNextTick } from "../__mocks__/utils";
import { ConnectionEventsManager } from "../managers";
import {
  ConnectionStatusEventType,
  createConnectionSubscription,
} from "../subscriptions";

describe("Connection event manager", () => {
  let { q, manager } = createTestSetup();
  let connectionEventsManager: ConnectionEventsManager;

  beforeEach(() => {
    let { q: _q, manager: _manager } = createTestSetup();
    q = _q;
    manager = _manager;
    connectionEventsManager = manager.getConnectionEventManager("1");
  });

  it("supports legacy lib connection events", async () => {
    const callback = jest.fn();

    const libSubscription = createConnectionSubscription({
      type: ConnectionStatusEventType.LIB_CONNECTED,
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
