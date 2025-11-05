import { Types } from "..";
import { GenericEvent } from "./managers";

export type ThreadCallbackPayload = {
    // Thread events
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
export type StoreCallbackPayload = {
    // Store events
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

export type KvdbCallbackPayload = {
    [Types.KvdbEventType.KVDB_STATS]:  {
        lastEntryDate: number;
        entryCount: number;
        kvdbId: string;
    },
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

export type UserEventCallbackPayload = {
    [Types.ConnectionEventType.USER_ADD]: Types.ContextUserEventData;
    [Types.ConnectionEventType.USER_REMOVE]: Types.ContextUserEventData;
    [Types.ConnectionEventType.USER_STATUS]: Types.ContextUsersStatusChangedEventData;
};

export type EventsCallbackPayload = Types.ContextCustomEventData;

export type EventCallback = {
    callback: (e: Types.Event | GenericEvent<unknown>) => void;
    symbol: Symbol;
};

export interface Subscription<T, S> {
    type: T;
    selector: S;
    id: string;
    callbacks: EventCallback[];
}
function toEventCallback(f: Function): EventCallback {
    return {
        callback: f as (e: Types.Event | GenericEvent<unknown>) => void,
        symbol: Symbol(),
    };
}

export function createThreadSubscription<
    T extends Types.ThreadEventType,
    S extends Types.ThreadEventSelectorType
>(s: {
    type: T;
    selector: S;
    id: string;
    callbacks: ((arg: GenericEvent<ThreadCallbackPayload[T]>) => void)[];
}) {
    return {
        ...s,
        callbacks: s.callbacks.map(toEventCallback),
    };
}


export function createStoreSubscription<
    T extends Types.StoreEventType,
    S extends Types.StoreEventSelectorType
>(s: {
    type: T;
    selector: S;
    id: string;
    callbacks: ((arg: GenericEvent<StoreCallbackPayload[T]>) => void)[];
}) {
    return {
        ...s,
        callbacks: s.callbacks.map(toEventCallback),
    };
}


export function createKvdbSubscription<
    T extends Types.KvdbEventType,
    S extends Types.KvdbEventSelectorType
>(s: {
    type: T;
    selector: S;
    id: string;
    callbacks: ((arg: GenericEvent<KvdbCallbackPayload[T]>) => void)[];
}) {
    return {
        ...s,
        callbacks: s.callbacks.map(toEventCallback),
    };
}

export function createInboxSubscription<
    T extends Types.InboxEventType,
    S extends Types.InboxEventSelectorType
>(s: {
    type: T;
    selector: S;
    id: string;
    callbacks: ((arg: GenericEvent<InboxCallbackPayload[T]>) => void)[];
}) {
    return {
        ...s,
        callbacks: s.callbacks.map(toEventCallback),
    };
}

export function createEventSubscription(
    s: {
        channel: string;
        selector: Types.EventsEventSelectorType;
        id: string;
        callbacks: ((arg: GenericEvent<EventsCallbackPayload>) => void)[];
    },
): Subscription<string, Types.EventsEventSelectorType> & { channel: string } {
    return {
        type: s.channel,
        selector: s.selector,
        id: s.id,
        callbacks: s.callbacks.map(toEventCallback),
        channel: s.channel,
    };
}
export enum ConnectionEventType {
    LIB_DISCONNECTED = 0,
    LIB_PLATFORM_DISCONNECTED = 1,
    LIB_CONNECTED = 2,
}

export type ConnectionSubscription = {
    type: ConnectionEventType;
    callbacks: EventCallback[];
};

export function createConnectionSubscription(s: {
    type: ConnectionEventType;
    callbacks: ((arg: GenericEvent<undefined>) => void)[];
}): ConnectionSubscription {
    return {
        ...s,
        callbacks: s.callbacks.map(toEventCallback),
    };
}

export function createUserEventSubscription<
    T extends Types.ConnectionEventType,
    S extends Types.ConnectionEventSelectorType
>(s: {
    type: T;
    selector: S;
    id: string;
    callbacks: ((arg: GenericEvent<UserEventCallbackPayload[T]>) => void)[];
}): Subscription<T, S> {
    return {
        ...s,
        callbacks: s.callbacks.map(toEventCallback),
    };
}

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
    buildSubscriptionQuery(
        eventType: E,
        selectorType: S,
        selectorId: string,
    ): Promise<string>;
}

export type SubscriberForThreadsEvents = EventSubscriber<
    Types.ThreadEventType,
    Types.ThreadEventSelectorType
>;
export type SubscriberForStoreEvents = EventSubscriber<
    Types.StoreEventType,
    Types.StoreEventSelectorType
>;
export type SubscriberForInboxEvents = EventSubscriber<
    Types.InboxEventType,
    Types.InboxEventSelectorType
>;
export type SubscriberForKvdbEvents = EventSubscriber<
    Types.KvdbEventType,
    Types.KvdbEventSelectorType
>;
export type SubscriberForUserEvents = EventSubscriber<
    Types.ConnectionEventType,
    Types.ConnectionEventSelectorType
>;
export type SubscriberForEvents = EventSubscriber<
    string,
    Types.EventsEventSelectorType
>;
