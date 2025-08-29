import { Types } from "..";
import {
  ConnectionEventType,
  EventCallback,
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
 * const subscribtionA = createSubscription({
 *  type: Types.ThreadEventType.THREAD_CREATE,
 *  selector: Types.ThreadEventSelectorType.THREAD_CONTAINER,
 *  selectorId: "s0dvos0div0smidvmsd"
 *  callbacks: [fn1,fn2]
 * })
 *
 * const subscribtionB = createThreadSubscribtion({
 *  type: Types.ThreadEventType.MESSAGE_CREATED,
 *  selector: Types.ThreadEventSelectorType.CONTEXT_CONTAINER,
 *  selectorId: "s0dvos0div0smidvmsd"
 *  callbacks: [fn3]
 * })
 *
 * await manager.subscribeFor([subscriptionA,subscriptionB])
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
  | `connection/${string}`;

export interface GenericEvent<K> extends Types.Event {
  /**
   * Data associated with the event.
   */
  data: K;

  /**
   * ID of connection to which the event was sent.
   */
  connectionId: number;
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

export const ConnectionChannels = {
  [ConnectionEventType.LIB_CONNECTED]: "channel/lib_connected",
  [ConnectionEventType.LIB_DISCONNECTED]: "channel/lib_disconnected",
  [ConnectionEventType.LIB_PLATFORM_DISCONNECTED]:
    "channel/lib_platform_disconnected",
};

export class ConnectionEventsManager extends BaseEventDispatcherManager {
  constructor(private connectionId: string) {
    super();
  }

  protected override apiSubscribeFor(channels: string[]) {
    return Promise.resolve(channels);
  }

  protected override apiUnsubscribeFrom() {
    return Promise.resolve();
  }

  async subscribeFor(
    subscriptions: { type: ConnectionEventType; callbacks: EventCallback[] }[],
  ) {
    const subscriptionChannels = subscriptions.map((x) => {
      return `${this.connectionId}/${ConnectionEventType[x.type]}`;
    });
    return this.prepareSubscription(subscriptionChannels, subscriptions);
  }
}
