import { Types } from "..";
import {
    ThreadEventSelectorType,
    ThreadEventType
} from "../Types";
import {GenericEvent} from "./managers";




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
};


type EventParam<P, T> = T extends keyof P ? P[T] : unknown;

export type EventCallback = {
    callback:(e:Types.Event)=>void
    symbol:Symbol
}

export interface Subscription<T,S>{
    type:T;
    selector:S;
    id:string,
    callbacks:EventCallback[]
}
function toEventCallback(f:Function):EventCallback{
    return {
        callback:f as any,
        symbol:Symbol()
    }
}

export function createThreadSubscription<T extends Types.ThreadEventType, S extends Types.ThreadEventSelectorType>(s:{
    type:T;
    selector:S;
    id:string,
    callbacks:((arg: GenericEvent<ThreadCallbackPayload[T]>) => void)[]
}) {
    return {
        ...s,
        callbacks:s.callbacks.map(toEventCallback)
    }
}


export function createStoreSubscription<T extends Types.StoreEventType, S extends Types.StoreEventSelectorType>(s:{
    type:T;
    selector:S;
    id:string,
    callbacks:((arg: GenericEvent<StoreCallbackPayload[T]>) => void)[]
}) {
    return {
        ...s,
        callbacks:s.callbacks.map(toEventCallback)
    }
}


export function createKvdbSubscription<T extends Types.KvdbEventType, S extends Types.KvdbEventSelectorType>(s:{
    type:T;
    selector:S;
    id:string,
    callbacks:((arg: GenericEvent<KvdbCallbackPayload[T]>) => void)[]
}) {
    return {
        ...s,
        callbacks:s.callbacks.map(toEventCallback)
    }
}

export function createInboxSubscription<T extends Types.InboxEventType, S extends Types.InboxEventSelectorType>(s:{
    type:T;
    selector:S;
    id:string,
    callbacks:((arg: GenericEvent<InboxCallbackPayload[T]>) => void)[]
}) {
    return {
        ...s,
        callbacks:s.callbacks.map(toEventCallback)
    }
}

export enum ConnectionEventType {
    LIB_DISCONNECTED=0,
    LIB_PLATFORM_DISCONNECTED=1,
    LIB_CONNECTED=2,
}

export function createConnectionSubscription(s:{
    type:ConnectionEventType;
    callbacks:((arg: GenericEvent<undefined>) => void)[]
}) {
    return {
        ...s,
        callbacks:s.callbacks.map(toEventCallback)
    }
}



export interface EventSubscriber<E,S>{
    /**
     * Subscribe for the Thread events on the given subscription query.
     * @param {string[]} subscriptionQueries list of queries
     */
    subscribeFor(subscriptionQueries: string[]): Promise<string[]>;
    /**
     * Unsubscribes from events for the given subscriptionId.
     */
    unsubscribeFrom(subscriptionIds: string[]): Promise<void>;
    /**
     * Generate subscription Query for the Thread events.
     * @param {EventType} eventType type of event which you listen for
     * @param {EventSelectorType} selectorType scope on which you listen for events
     * @param {string} selectorId ID of the selector
     */
    buildSubscriptionQuery(eventType: E, selectorType: S, selectorId: string): Promise<string>;
}

export type SubscriberForThreadsEvents = EventSubscriber<ThreadEventType, ThreadEventSelectorType>
export type SubscriberForStoreEvents = EventSubscriber<Types.StoreEventType, Types.StoreEventSelectorType>
export type SubscriberForInboxEvents = EventSubscriber<Types.InboxEventType, Types.InboxEventSelectorType>
export type SubscriberForKvdbEvents = EventSubscriber<Types.KvdbEventType, Types.KvdbEventSelectorType>

