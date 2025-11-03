import { Types } from "..";
import {
  ConnectionLibEventType,
  EventCallback,
  SubscriberForConnectionEvents,
  SubscriberForEvents,
  SubscriberForInboxEvents,
  SubscriberForKvdbEvents,
  SubscriberForStoreEvents,
  SubscriberForThreadsEvents,
  Subscription,
} from "./subscriptions";

/**
 *
 * General usage
 *
 * const fn1 = () =>{}
 * const fn2 = () =>{}
 *
 * const fn3 = () =>{}
 *
 *
 * const subscriptionA = createSubscription({
 *  type: Types.ThreadEventType.THREAD_CREATE,
 *  selector: Types.ThreadEventSelectorType.THREAD_CONTAINER,
 *  selectorId: "s0dvos0div0smidvmsd"
 *  callbacks: [fn1,fn2]
 * })
 *
 * const subscriptionB = createThreadSubscribtion({
 *  type: Types.ThreadEventType.MESSAGE_CREATED,
 *  selector: Types.ThreadEventSelectorType.CONTEXT_CONTAINER,
 *  selectorId: "s0dvos0div0smidvmsd"
 *  callbacks: [fn3]
 * })
 *
 * await manager.subscribeFor([subscriptionA, subscriptionB])
 *
 *
 * await manager.unsubscribeFrom(subscriptionB)
 *
 * --- or ---
 *
 * await manager.removeCallback(subscriptionA.callbacks[0])
 */

export type Channel =
  | "inbox"
  | `inbox/${string}/entries`
  | "store"
  | `store/${string}/files`
  | "thread"
  | `thread/${string}/messages`
  | `connection/${string}`
  | "context/userAdded"
  | "context/userRemoved"
  | "context/userStatus"
  | `context/${string}/${string}`;

export interface GenericEvent<K> extends Types.Event {
  /**
   * Data associated with the event.
   */
  data: K;
}


export abstract class BaseEventDispatcherManager {
  private _listenersSymbols = new Map<Symbol, string>();
  private _listeners = new Map<string, EventCallback[]>();

  get listeners() {
    return this._listeners;
  }

  protected abstract apiSubscribeFor(strings: string[]): Promise<string[]>;
  protected abstract apiUnsubscribeFrom(strings: string[]): Promise<void>;

  dispatchEvent(event: Types.Event) {
    const callbacks = event.subscriptions.flatMap((s) =>
      this._listeners.get(s),
    );
    for (const listener of callbacks) {
      listener.callback(event);
    }
  }

  unregisterCallback(symbol: Symbol) {
    this._listenersSymbols.delete(symbol);
    for (const keys of this._listeners.keys()) {
      const listeners = this._listeners.get(keys);
      if (listeners) {
        this._listeners.set(
          keys,
          listeners.filter((x) => x.symbol !== symbol),
        );
        if (this._listeners.get(keys).length === 0) {
          this._listeners.delete(keys);
        }
      }
    }
  }

  protected async prepareSubscription(
    channelList: string[],
    subscriptions: { callbacks: EventCallback[] }[],
  ) {
    const subscriptionIds = await this.apiSubscribeFor(channelList);

    subscriptionIds.forEach((id, i) => {
      const subscription = subscriptions[i];
      this._listeners.set(id, subscription.callbacks);
      for (const cb of subscription.callbacks) {
        this._listenersSymbols.set(cb.symbol, id);
      }
      return subscription;
    });
    return subscriptionIds;
  }

  async unsubscribeFrom(subscriptionsId: string[]) {
    for (const subscriptionId of subscriptionsId) {
      for (const [
        key,
        callbackSubscription,
      ] of this._listenersSymbols.entries()) {
        if (callbackSubscription === subscriptionId) {
          this.unregisterCallback(key);
        }
      }
    }
    return this.apiUnsubscribeFrom(subscriptionsId);
  }
}

export class ThreadEventsManager extends BaseEventDispatcherManager {
  constructor(private threadApi: SubscriberForThreadsEvents) {
    super();
  }

  protected override apiSubscribeFor(channels: string[]) {
    return this.threadApi.subscribeFor(channels);
  }
  protected override apiUnsubscribeFrom(subscriptionId: string[]) {
    return this.threadApi.unsubscribeFrom(subscriptionId);
  }

  async subscribeFor(
    subscriptions: Subscription<
      Types.ThreadEventType,
      Types.ThreadEventSelectorType
    >[],
  ) {
    const subscriptionChannels = await Promise.all(
      subscriptions.map((s) => {
        return this.threadApi.buildSubscriptionQuery(s.type, s.selector, s.id);
      }),
    );

    return this.prepareSubscription(subscriptionChannels, subscriptions);
  }
}

export class StoreEventsManager extends BaseEventDispatcherManager {
  constructor(private storeApi: SubscriberForStoreEvents) {
    super();
  }

  protected override apiSubscribeFor(channels: string[]) {
    return this.storeApi.subscribeFor(channels);
  }
  protected override apiUnsubscribeFrom(subscriptionId: string[]) {
    return this.storeApi.unsubscribeFrom(subscriptionId);
  }

  async subscribeFor(
    subscriptions: Subscription<
      Types.StoreEventType,
      Types.StoreEventSelectorType
    >[],
  ) {
    const subscriptionChannels = await Promise.all(
      subscriptions.map((s) => {
        return this.storeApi.buildSubscriptionQuery(s.type, s.selector, s.id);
      }),
    );

    return this.prepareSubscription(subscriptionChannels, subscriptions);
  }
}

export class InboxEventsManager extends BaseEventDispatcherManager {
  constructor(private inboxApi: SubscriberForInboxEvents) {
    super();
  }

  protected override apiSubscribeFor(channels: string[]) {
    return this.inboxApi.subscribeFor(channels);
  }
  protected override apiUnsubscribeFrom(subscriptionId: string[]) {
    return this.inboxApi.unsubscribeFrom(subscriptionId);
  }

  async subscribeFor(
    subscriptions: Subscription<
      Types.InboxEventType,
      Types.InboxEventSelectorType
    >[],
  ) {
    const subscriptionChannels = await Promise.all(
      subscriptions.map((s) => {
        return this.inboxApi.buildSubscriptionQuery(s.type, s.selector, s.id);
      }),
    );
    return this.prepareSubscription(subscriptionChannels, subscriptions);
  }
}

export class KvdbEventsManager extends BaseEventDispatcherManager {
  constructor(private kvdbApi: SubscriberForKvdbEvents) {
    super();
  }

  protected override apiSubscribeFor(channels: string[]) {
    return this.kvdbApi.subscribeFor(channels);
  }
  protected override apiUnsubscribeFrom(subscriptionId: string[]) {
    return this.kvdbApi.unsubscribeFrom(subscriptionId);
  }

  async subscribeFor(
    subscriptions: Subscription<
      Types.KvdbEventType,
      Types.KvdbEventSelectorType
    >[],
  ) {
    const subscriptionChannels = await Promise.all(
      subscriptions.map((s) => {
        return this.kvdbApi.buildSubscriptionQuery(s.type, s.selector, s.id);
      }),
    );

    return this.prepareSubscription(subscriptionChannels, subscriptions);
  }
}

export class CustomEventsManager extends BaseEventDispatcherManager {
  constructor(private eventsApi: SubscriberForEvents) {
    super();
  }

  protected override apiSubscribeFor(channels: string[]) {
    return this.eventsApi.subscribeFor(channels);
  }
  protected override apiUnsubscribeFrom(subscriptionId: string[]) {
    return this.eventsApi.unsubscribeFrom(subscriptionId);
  }

  async subscribeFor(
    subscriptions: Subscription<string, Types.EventsEventSelectorType>[],
  ) {
    const subscriptionChannels = await Promise.all(
      subscriptions.map((s) => {
        return this.eventsApi.buildSubscriptionQuery(s.type, s.selector, s.id);
      }),
    );
    return this.prepareSubscription(subscriptionChannels, subscriptions);
  }
}

export const ConnectionLibChannels: Record<ConnectionLibEventType, string> = {
  [ConnectionLibEventType.LIB_CONNECTED]: "channel/lib_connected",
  [ConnectionLibEventType.LIB_DISCONNECTED]: "channel/lib_disconnected",
  [ConnectionLibEventType.LIB_PLATFORM_DISCONNECTED]:
    "channel/lib_platform_disconnected",
};

export class ConnectionEventsManager extends BaseEventDispatcherManager {
  private useConnectionApi = false;
  private remoteSubscriptionIds = new Set<string>();

  constructor(
    private connectionId: string,
    private connectionApi?: SubscriberForConnectionEvents,
  ) {
    super();
  }

  protected override apiSubscribeFor(channels: string[]) {
    if (this.useConnectionApi) {
      if (!this.connectionApi) {
        return Promise.reject(
          new Error("Connection API not available for remote subscriptions."),
        );
      }
      return this.connectionApi.subscribeFor(channels);
    }
    return Promise.resolve(channels);
  }

  protected override async apiUnsubscribeFrom(subscriptionIds: string[]) {
    if (this.connectionApi) {
      const remoteIds = subscriptionIds.filter((id) =>
        this.remoteSubscriptionIds.has(id),
      );
      if (remoteIds.length) {
        await this.connectionApi.unsubscribeFrom(remoteIds);
        remoteIds.forEach((id) => this.remoteSubscriptionIds.delete(id));
      }
    }
    return Promise.resolve();
  }

  async subscribeFor(
    subscriptions: (
      | Subscription<
          Types.ConnectionEventType,
          Types.ConnectionEventSelectorType
        >
      | { type: ConnectionLibEventType; callbacks: EventCallback[] }
    )[],
  ) {
    const isRemoteSubscription = (
      sub:
        | Subscription<
            Types.ConnectionEventType,
            Types.ConnectionEventSelectorType
          >
        | { type: ConnectionLibEventType; callbacks: EventCallback[] },
    ): sub is Subscription<
      Types.ConnectionEventType,
      Types.ConnectionEventSelectorType
    > => "selector" in sub && "id" in sub;

    const remoteSubscriptions = subscriptions.filter(isRemoteSubscription);
    const libSubscriptions = subscriptions.filter(
      (s) => !isRemoteSubscription(s),
    ) as { type: ConnectionLibEventType; callbacks: EventCallback[] }[];

    const result: string[] = new Array(subscriptions.length);

    if (remoteSubscriptions.length) {
      if (!this.connectionApi) {
        throw new Error(
          "Connection API not provided. Cannot subscribe for remote connection events.",
        );
      }
      const channels = await Promise.all(
        remoteSubscriptions.map((s) =>
          this.connectionApi!.buildSubscriptionQuery(
            s.type,
            s.selector,
            s.id,
          ),
        ),
      );
      const remoteIds = await (async () => {
        this.useConnectionApi = true;
        try {
          return await this.prepareSubscription(
            channels,
            remoteSubscriptions,
          );
        } finally {
          this.useConnectionApi = false;
        }
      })();
      remoteIds.forEach((id) => this.remoteSubscriptionIds.add(id));

      let cursor = 0;
      subscriptions.forEach((sub, idx) => {
        if (isRemoteSubscription(sub)) {
          result[idx] = remoteIds[cursor++];
        }
      });
    }

    if (libSubscriptions.length) {
      const libChannels = libSubscriptions.map(
        (x) => `${this.connectionId}/${ConnectionLibChannels[x.type]}`,
      );
      const libIds = await this.prepareSubscription(
        libChannels,
        libSubscriptions,
      );

      let cursor = 0;
      subscriptions.forEach((sub, idx) => {
        if (!isRemoteSubscription(sub)) {
          result[idx] = libIds[cursor++];
        }
      });
    }

    return result;
  }
}
