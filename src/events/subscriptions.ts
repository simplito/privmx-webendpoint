import * as Types from "../Types.js";

/**
 * Wire-format event channel strings the Bridge tags events with. Returned in
 * `Event.subscriptions` and matched by the {@link EventManager} to route an
 * event to its registered callbacks.
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

/**
 * An {@link Event} whose `data` payload is narrowed to a concrete type `K`.
 * Produced for the typed callbacks created with the `create*Subscription`
 * helpers, so `event.data` is strongly typed instead of `unknown`.
 */
export interface GenericEvent<K> extends Types.Event {
    /**
     * Data associated with the event, typed as `K`.
     */
    data: K;
}

/**
 * Maps each Thread event type to the shape of its event `data` payload.
 */
export type ThreadCallbackPayload = {
    [Types.ThreadEventType.THREAD_CREATE]: Types.Thread;
    [Types.ThreadEventType.THREAD_UPDATE]: Types.Thread;
    [Types.ThreadEventType.THREAD_DELETE]: { threadId: string };
    [Types.ThreadEventType.THREAD_STATS]: {
        lastMsgDate: number;
        messagesCount: number;
        threadId: string;
    };
    [Types.ThreadEventType.MESSAGE_CREATE]: Types.Message;
    [Types.ThreadEventType.MESSAGE_UPDATE]: Types.Message;
    [Types.ThreadEventType.MESSAGE_DELETE]: {
        threadId: string;
        messageId: string;
    };
    [Types.ThreadEventType.COLLECTION_CHANGE]: Types.CollectionChangedEventData;
};
/**
 * Maps each Store event type to the shape of its event `data` payload.
 */
export type StoreCallbackPayload = {
    [Types.StoreEventType.STORE_CREATE]: Types.Store;
    [Types.StoreEventType.STORE_UPDATE]: Types.Store;
    [Types.StoreEventType.STORE_DELETE]: { storeId: string };
    [Types.StoreEventType.STORE_STATS]: {
        contextId: string;
        storeId: string;
        lastFileDate: number;
        filesCount: number;
    };
    [Types.StoreEventType.FILE_CREATE]: Types.File;
    [Types.StoreEventType.FILE_UPDATE]: Types.File;
    [Types.StoreEventType.FILE_DELETE]: {
        contextId: string;
        storeId: string;
        fileId: string;
    };
    [Types.StoreEventType.COLLECTION_CHANGE]: Types.CollectionChangedEventData;
};

/**
 * Maps each Inbox event type to the shape of its event `data` payload.
 */
export type InboxCallbackPayload = {
    [Types.InboxEventType.INBOX_CREATE]: Types.Inbox;
    [Types.InboxEventType.INBOX_UPDATE]: Types.Inbox;
    [Types.InboxEventType.INBOX_DELETE]: { inboxId: string };
    [Types.InboxEventType.ENTRY_CREATE]: Types.InboxEntry;
    [Types.InboxEventType.ENTRY_DELETE]: {
        contextId: string;
        inboxId: string;
        entryId: string;
    };
    [Types.InboxEventType.COLLECTION_CHANGE]: Types.CollectionChangedEventData;
};

/**
 * Maps each KVDB event type to the shape of its event `data` payload.
 */
export type KvdbCallbackPayload = {
    [Types.KvdbEventType.KVDB_STATS]: {
        lastEntryDate: number;
        entryCount: number;
        kvdbId: string;
    };
    [Types.KvdbEventType.KVDB_CREATE]: Types.Kvdb;
    [Types.KvdbEventType.KVDB_UPDATE]: Types.Kvdb;
    [Types.KvdbEventType.KVDB_DELETE]: { kvdbId: string };
    [Types.KvdbEventType.ENTRY_UPDATE]: Types.KvdbEntry;
    [Types.KvdbEventType.ENTRY_CREATE]: Types.KvdbEntry;
    [Types.KvdbEventType.ENTRY_DELETE]: {
        contextId: string;
        kvdbId: string;
        entryId: string;
    };
    [Types.KvdbEventType.COLLECTION_CHANGE]: Types.CollectionChangedEventData;
};

/**
 * Maps each user (Context membership) event type to its event `data` payload.
 */
export type UserEventCallbackPayload = {
    [Types.ConnectionEventType.USER_ADD]: Types.ContextUserEventData;
    [Types.ConnectionEventType.USER_REMOVE]: Types.ContextUserEventData;
    [Types.ConnectionEventType.USER_STATUS]: Types.ContextUsersStatusChangedEventData;
};

/**
 * The `data` payload shape of a custom (application-defined) Context event.
 */
export type EventsCallbackPayload = Types.ContextCustomEventData;

/**
 * Local connection-state event types emitted by the library (not the Bridge).
 */
export enum ConnectionStatusEventType {
    LIB_DISCONNECTED = 0,
    LIB_PLATFORM_DISCONNECTED = 1,
    LIB_CONNECTED = 2,
}

/**
 * Maps connection-state events to their wire-format channel strings.
 * @internal
 */
export const ConnectionChannels: Record<ConnectionStatusEventType, string> = {
    [ConnectionStatusEventType.LIB_CONNECTED]: "channel/lib_connected",
    [ConnectionStatusEventType.LIB_DISCONNECTED]: "channel/lib_disconnected",
    [ConnectionStatusEventType.LIB_PLATFORM_DISCONNECTED]: "channel/lib_platform_disconnected",
};

/**
 * An event listener callback. Receives the raw {@link Event}, or a
 * {@link GenericEvent} with a typed `data` payload when built through one of the
 * `create*Subscription` helpers.
 */
export type EventCallback = (e: Types.Event | GenericEvent<unknown>) => void;

/**
 * Identifies which module a subscription targets, used by {@link EventManager}
 * to route subscribe/unsubscribe calls to the right API.
 */
export type EventModule = EventSubscription["module"];

/** A Thread-events subscription built by {@link createThreadSubscription}. */
export interface ThreadSubscription {
    module: "thread";
    type: Types.ThreadEventType;
    selector: Types.ThreadEventSelectorType;
    id: string;
    callbacks: EventCallback[];
}
/** A Store-events subscription built by {@link createStoreSubscription}. */
export interface StoreSubscription {
    module: "store";
    type: Types.StoreEventType;
    selector: Types.StoreEventSelectorType;
    id: string;
    callbacks: EventCallback[];
}
/** An Inbox-events subscription built by {@link createInboxSubscription}. */
export interface InboxSubscription {
    module: "inbox";
    type: Types.InboxEventType;
    selector: Types.InboxEventSelectorType;
    id: string;
    callbacks: EventCallback[];
}
/** A KVDB-events subscription built by {@link createKvdbSubscription}. */
export interface KvdbSubscription {
    module: "kvdb";
    type: Types.KvdbEventType;
    selector: Types.KvdbEventSelectorType;
    id: string;
    callbacks: EventCallback[];
}
/** A custom-events subscription built by {@link createEventSubscription}. */
export interface CustomEventSubscription {
    module: "event";
    /** Custom event channel name. */
    type: string;
    selector: Types.EventsEventSelectorType;
    id: string;
    callbacks: EventCallback[];
}
/** A user-events subscription built by {@link createUserEventSubscription}. */
export interface UserEventSubscription {
    module: "user";
    type: Types.ConnectionEventType;
    selector: Types.ConnectionEventSelectorType;
    id: string;
    callbacks: EventCallback[];
}
/**
 * A connection-state subscription built by {@link createConnectionSubscription}.
 * Has no selector/id - it is matched purely by connection-state event type.
 */
export interface ConnectionStatusSubscription {
    module: "connection";
    type: ConnectionStatusEventType;
    callbacks: EventCallback[];
}

/**
 * Union of every subscription kind accepted by {@link EventManager.subscribe}.
 * Build instances with the `create*Subscription` helpers.
 */
export type EventSubscription =
    | ThreadSubscription
    | StoreSubscription
    | InboxSubscription
    | KvdbSubscription
    | CustomEventSubscription
    | UserEventSubscription
    | ConnectionStatusSubscription;

function toEventCallback(f: Function): EventCallback {
    return f as EventCallback;
}

/**
 * Builds a typed Thread subscription. Each callback receives a
 * {@link GenericEvent} whose `data` matches the chosen event `type`.
 *
 * @param {object} s subscription descriptor (`type`, `selector`, `id`, `callbacks`)
 * @returns {ThreadSubscription} a subscription for {@link EventManager.subscribe}
 */
export function createThreadSubscription<
    T extends Types.ThreadEventType,
    S extends Types.ThreadEventSelectorType,
>(s: {
    type: T;
    selector: S;
    id: string;
    callbacks: ((arg: GenericEvent<ThreadCallbackPayload[T]>) => void)[];
}): ThreadSubscription {
    return {
        module: "thread",
        type: s.type,
        selector: s.selector,
        id: s.id,
        callbacks: s.callbacks.map(toEventCallback),
    };
}

/**
 * Builds a typed Store subscription. Each callback receives a
 * {@link GenericEvent} whose `data` matches the chosen event `type`.
 *
 * @param {object} s subscription descriptor (`type`, `selector`, `id`, `callbacks`)
 * @returns {StoreSubscription} a subscription for {@link EventManager.subscribe}
 */
export function createStoreSubscription<
    T extends Types.StoreEventType,
    S extends Types.StoreEventSelectorType,
>(s: {
    type: T;
    selector: S;
    id: string;
    callbacks: ((arg: GenericEvent<StoreCallbackPayload[T]>) => void)[];
}): StoreSubscription {
    return {
        module: "store",
        type: s.type,
        selector: s.selector,
        id: s.id,
        callbacks: s.callbacks.map(toEventCallback),
    };
}

/**
 * Builds a typed KVDB subscription. Each callback receives a
 * {@link GenericEvent} whose `data` matches the chosen event `type`.
 *
 * @param {object} s subscription descriptor (`type`, `selector`, `id`, `callbacks`)
 * @returns {KvdbSubscription} a subscription for {@link EventManager.subscribe}
 */
export function createKvdbSubscription<
    T extends Types.KvdbEventType,
    S extends Types.KvdbEventSelectorType,
>(s: {
    type: T;
    selector: S;
    id: string;
    callbacks: ((arg: GenericEvent<KvdbCallbackPayload[T]>) => void)[];
}): KvdbSubscription {
    return {
        module: "kvdb",
        type: s.type,
        selector: s.selector,
        id: s.id,
        callbacks: s.callbacks.map(toEventCallback),
    };
}

/**
 * Builds a typed Inbox subscription. Each callback receives a
 * {@link GenericEvent} whose `data` matches the chosen event `type`.
 *
 * @param {object} s subscription descriptor (`type`, `selector`, `id`, `callbacks`)
 * @returns {InboxSubscription} a subscription for {@link EventManager.subscribe}
 */
export function createInboxSubscription<
    T extends Types.InboxEventType,
    S extends Types.InboxEventSelectorType,
>(s: {
    type: T;
    selector: S;
    id: string;
    callbacks: ((arg: GenericEvent<InboxCallbackPayload[T]>) => void)[];
}): InboxSubscription {
    return {
        module: "inbox",
        type: s.type,
        selector: s.selector,
        id: s.id,
        callbacks: s.callbacks.map(toEventCallback),
    };
}

/**
 * Builds a typed custom-event subscription for a given channel.
 *
 * @param {object} s subscription descriptor (`channel`, `selector`, `id`, `callbacks`)
 * @returns {CustomEventSubscription} a subscription for {@link EventManager.subscribe}
 */
export function createEventSubscription(s: {
    channel: string;
    selector: Types.EventsEventSelectorType;
    id: string;
    callbacks: ((arg: GenericEvent<EventsCallbackPayload>) => void)[];
}): CustomEventSubscription {
    return {
        module: "event",
        type: s.channel,
        selector: s.selector,
        id: s.id,
        callbacks: s.callbacks.map(toEventCallback),
    };
}

/**
 * Builds a connection-state subscription (lib connected / disconnected /
 * platform-disconnected).
 *
 * @param {object} s subscription descriptor (`type`, `callbacks`)
 * @returns {ConnectionStatusSubscription} a subscription for {@link EventManager.subscribe}
 */
export function createConnectionSubscription(s: {
    type: ConnectionStatusEventType;
    callbacks: ((arg: GenericEvent<undefined>) => void)[];
}): ConnectionStatusSubscription {
    return {
        module: "connection",
        type: s.type,
        callbacks: s.callbacks.map(toEventCallback),
    };
}

/**
 * Builds a typed user (Context membership) subscription. Each callback receives
 * a {@link GenericEvent} whose `data` matches the chosen event `type`.
 *
 * @param {object} s subscription descriptor (`type`, `selector`, `id`, `callbacks`)
 * @returns {UserEventSubscription} a subscription for {@link EventManager.subscribe}
 */
export function createUserEventSubscription<
    T extends Types.ConnectionEventType,
    S extends Types.ConnectionEventSelectorType,
>(s: {
    type: T;
    selector: S;
    id: string;
    callbacks: ((arg: GenericEvent<UserEventCallbackPayload[T]>) => void)[];
}): UserEventSubscription {
    return {
        module: "user",
        type: s.type,
        selector: s.selector,
        id: s.id,
        callbacks: s.callbacks.map(toEventCallback),
    };
}

/**
 * Structural interface implemented by APIs that can be driven by an event
 * manager: subscribe, unsubscribe, and build subscription-query strings.
 */
export interface EventSubscriber<E, S> {
    /**
     * Subscribe for events on the given subscription queries.
     * @param {string[]} subscriptionQueries list of queries
     */
    subscribeFor(subscriptionQueries: string[]): Promise<string[]>;
    /**
     * Unsubscribe from events for the given subscriptionIds.
     */
    unsubscribeFrom(subscriptionIds: string[]): Promise<void>;
    /**
     * Generate subscription query string for the requested event scope.
     * @param {E} eventType type of event which you listen for
     * @param {S} selectorType scope on which you listen for events
     * @param {string} selectorId ID of the selector
     */
    buildSubscriptionQuery(eventType: E, selectorType: S, selectorId: string): Promise<string>;
}
