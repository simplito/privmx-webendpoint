import { Types } from "..";
import { ThreadEventType, ThreadEventSelectorType, InboxEventType, InboxEventSelectorType } from "../Types";

export type Channel =
    | 'inbox'
    | `inbox/${string}/entries`
    | 'store'
    | `store/${string}/files`
    | 'thread'
    | `thread/${string}/messages`
    | `connection/${string}`;

/**
 * Represents a generic event structure.
 */
export interface GenericEvent<K extends keyof EventPayload> extends Types.Event {
    /**
     * Type of the event.
     */
    type: keyof EventPayload;

    /**
     * The channel through which the event was emitted.
     */
    channel: Channel;

    /**
     * Data associated with the event.
     */
    data: EventPayload[K];

    /**
     * ID of connection to which the event was sent.
     */
    connectionId: number;
}

export interface EventPayload {
    threadCreated: Types.Thread;
    threadUpdated: Types.Thread;
    threadDeleted: { threadId: string };
    threadStatsChanged: {
        lastMsgDate: number;
        messagesCount: number;
        threadId: string;
    };
    threadNewMessage: Types.Message;
    threadUpdatedMessage: Types.Message;
    threadMessageDeleted: {
        threadId: string;
        messageId: string;
    };
    storeCreated: Types.Store;
    storeUpdated: Types.Store;
    storeDeleted: { storeId: string };
    storeStatsChanged: {
        contextId: string;
        storeId: string;
        lastFileDate: number;
        filesCount: number;
    };
    storeFileCreated: Types.File;
    storeFileUpdated: Types.File;
    storeFileDeleted: {
        contextId: string;
        storeId: string;
        fileId: string;
    };
    inboxDeleted: { inboxId: string };
    inboxUpdated: Types.Inbox;
    inboxCreated: Types.Inbox;
    inboxEntryCreated: Types.InboxEntry;
    inboxEntryDeleted: {
        inboxId: string;
        entryId: string;
    };
    libConnected: undefined;
    libDisconnected: undefined;
    libPlatformDisconnected: undefined;
    libBreak: undefined;
}

type EventType = keyof EventPayload;

type EventHandler<E extends keyof EventPayload> = {
    event: E;
    callback: (event: GenericEvent<E>) => void;
};

export type OnMessageEventHandler =
    | EventHandler<'threadMessageDeleted'>
    | EventHandler<'threadNewMessage'>
    | EventHandler<'threadUpdatedMessage'>;

export type OnThreadEventHandler =
    | EventHandler<'threadCreated'>
    | EventHandler<'threadDeleted'>
    | EventHandler<'threadUpdated'>
    | EventHandler<'threadStatsChanged'>;

export type OnFileEventHandler =
    | EventHandler<'storeFileDeleted'>
    | EventHandler<'storeFileCreated'>
    | EventHandler<'storeFileUpdated'>;

export type OnStoreEventHandler =
    | EventHandler<'storeCreated'>
    | EventHandler<'storeStatsChanged'>
    | EventHandler<'storeUpdated'>
    | EventHandler<'storeDeleted'>;

export type OnInboxEventHandler =
    | EventHandler<'inboxDeleted'>
    | EventHandler<'inboxCreated'>
    | EventHandler<'inboxUpdated'>;

export type OnEntryEventHandler =
    | EventHandler<'inboxEntryCreated'>
    | EventHandler<'inboxEntryDeleted'>

export type OnConnectionHandler =
    | EventHandler<'libConnected'>
    | EventHandler<'libDisconnected'>
    | EventHandler<'libBreak'>
    | EventHandler<'libPlatformDisconnected'>;

export abstract class BaseEventManager {
    private _listeners: Map<string, Function[]>; // event tag - "event@channel"
    get listeners(): Map<string, Function[]> {
        return this._listeners;
    }

    protected channels: Set<Channel>;

    protected abstract subscribeForModuleEvents(contextId: string): Promise<void>;
    protected abstract subscribeForModuleElementsEvents(containerId: string): Promise<void>;
    protected abstract unsubscribeFromModuleEvents(): Promise<void>;
    protected abstract unsubscribeFromModuleElementsEvents(containerId: string): Promise<void>;

    constructor() {
        this._listeners = new Map();
        this.channels = new Set<Channel>();
    }

    /**
     * Checks whether the user is subscribed to given channel
     * @param channel Channel
     * @returns {boolean} `boolean`
     */
    protected isSubscribedToChannel(channel: Channel): boolean {
        return this.channels.has(channel);
    }

    protected hasEventsOnChannel(channel: Channel): boolean {
        return (
            Array.from(this._listeners.keys()).findIndex(
                (listenerTag) => listenerTag.split('@')[1] === channel
            ) !== -1
        );
    }

    /**
     * Removes an event listeners from given `channel` and `eventType`
     * @param {Channel} channel channel
     * @param {string} eventType type of the event
     * @param {function} callback callback function
     */
    protected removeEventListener = (
        channel: Channel,
        eventType: EventType,
        callback: Function
    ): void => {
        const eventTag = `${eventType}@${channel}`;

        if (this._listeners.has(eventTag)) {
            const channelCallbacks = this._listeners.get(eventTag)!;

            const newCallback = channelCallbacks.filter((cb) => cb !== callback);
            if(newCallback.length === 0){
                this._listeners.delete(eventTag);
            }else{
                this._listeners.set(eventTag, newCallback);
            }

            if (!this.hasEventsOnChannel(channel)) {
                this.channels.delete(channel);
            }
        }
    };

    /**
     * Removes all listeners from given channel
     * @param {Channel} channel channel
     * @returns {void}
     */
    removeChannelEvents = (channel: Channel): void => {
        const listenersToRemove = Array.from(this._listeners.keys()).filter(
            (listenerTag) => listenerTag.split('@')[1] === channel
        );
        listenersToRemove.forEach((listenerTag) => {
            this._listeners.delete(listenerTag);
        });
    };

    dispatchEvent(event: Types.Event) {
        if (
            event.type == 'libConnected' ||
            event.type == 'libDisconnected' ||
            event.type == 'libPlatformDisconnected'
        ) {
            event.channel = `connection/${event.connectionId}`;
        }

        const eventTag = `${event.type}@${event.channel}`;
        if (this._listeners.has(eventTag)) {
            const callbacks = this._listeners.get(eventTag);
            if (callbacks) {
                callbacks.forEach((callback) => callback(event));
            }
        }
    }

    /**
     * Add an event listeners on given channel and eventType
     * @param {Channel} channel channel
     * @param {string} eventType type of the event
     * @param {function} callback callback function
     * @returns {function} function to remove the event listeners
     */
    private addEventListener = (
        channel: Channel,
        eventType: EventType,
        callback: Function
    ): (() => void) => {
        const eventTag = `${eventType}@${channel}`;
        if (this._listeners.has(eventTag)) {
            this._listeners.get(eventTag)!.push(callback);
        } else {
            this._listeners.set(eventTag, [callback]);
        }
        this.channels.add(channel);
        return () => {
            this.removeEventListener(channel, eventType, callback);
        };
    };

    protected addContainerListener = async (
        channel: Channel,
        eventType: EventType,
        callback: Function
    ) => {
        if (!this.isSubscribedToChannel(channel)) {
            await this.subscribeForModuleEvents("");
        }
        const removeListener = this.addEventListener(channel, eventType, callback);
        return async () => {
            removeListener();
            if (!this.hasEventsOnChannel(channel)) {
                await this.unsubscribeFromModuleEvents();
            }
        };
    };

    protected addContainerElementListener = async (
        containerId: string,
        channel: Channel,
        eventType: EventType,
        callback: Function
    ) => {
        if (!this.isSubscribedToChannel(channel)) {
            await this.subscribeForModuleElementsEvents(containerId);
        }
        const removeListener = this.addEventListener(channel, eventType, callback);
        return async () => {
            removeListener();
            if (!this.hasEventsOnChannel(channel)) {
                await this.unsubscribeFromModuleElementsEvents(containerId);
            }
        };
    };
}

export interface SubscriberForThreadsEvents {
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
    buildSubscriptionQuery(eventType: ThreadEventType, selectorType: ThreadEventSelectorType, selectorId: string): Promise<string>;
}


export class ThreadEventsManager extends BaseEventManager {
    constructor(private threadApi: SubscriberForThreadsEvents) {
        super();
    }

    async subscribeForModuleEvents() {
        // return this.threadApi.subscribeForThreadEvents();
    }
    async subscribeForModuleElementsEvents(_id: string) {
        // return this.threadApi.subscribeForMessageEvents(id);
    }
    async unsubscribeFromModuleEvents() {
        // return this.threadApi.unsubscribeFromThreadEvents();
    }
    async unsubscribeFromModuleElementsEvents(_id: string) {
        // return this.threadApi.unsubscribeFromMessageEvents(id);
    }

    async onThreadEvent(handler: OnThreadEventHandler) {
        const channel: Channel = 'thread';
        return this.addContainerListener(channel, handler.event, handler.callback);
    }

    async onMessageEvent(threadId: string, handler: OnMessageEventHandler) {
        const channel: Channel = `thread/${threadId}/messages`;
        return this.addContainerElementListener(threadId, channel, handler.event, handler.callback);
    }
}



export interface SubscriberForStoreEvents {
    /**
     * Subscribe for the Store events on the given subscription query.
     * @param {string[]} subscriptionQueries list of queries
     */
    subscribeFor(subscriptionQueries: string[]): Promise<string[]>;
    /**
     * Unsubscribes from events for the given subscriptionId.
     */
    unsubscribeFrom(subscriptionIds: string[]): Promise<void>;
    /**
     * Generate subscription Query for the Store events.
     * @param {EventType} eventType type of event which you listen for
     * @param {EventSelectorType} selectorType scope on which you listen for events  
     * @param {string} selectorId ID of the selector
     */
    buildSubscriptionQuery(eventType: Types.StoreEventType, selectorType: Types.StoreEventSelectorType, selectorId: string): Promise<string>;
}


export class StoreEventsManager extends BaseEventManager {
    constructor(private storeApi: SubscriberForStoreEvents) {
        super();
    }
    async subscribeForModuleEvents() {
        
        // return this.storeApi.subscribeForStoreEvents()
    }
    async subscribeForModuleElementsEvents(_id:string){
        // return this.storeApi.subscribeForFileEvents(id)
    }
    async unsubscribeFromModuleEvents(){
        // return this.storeApi.unsubscribeFromStoreEvents()
    }
    async unsubscribeFromModuleElementsEvents(_id:string){
        // return this.storeApi.unsubscribeFromFileEvents(id)
    }

    async onStoreEvent(handler: OnStoreEventHandler) {
        const channel: Channel = 'store';
        return this.addContainerListener(channel, handler.event, handler.callback);
    }

    async onFileEvent(storeId: string, handler: OnFileEventHandler) {
        const channel: Channel = `store/${storeId}/files`;
        return this.addContainerElementListener(storeId, channel, handler.event, handler.callback);
    }
}

export interface SubscriberForInboxEvents {
    /**
     * Subscribe for the Inbox events on the given subscription query.
     * @param {string[]} subscriptionQueries list of queries
     */
    subscribeFor(subscriptionQueries: string[]): Promise<string[]>;
    /**
     * Unsubscribes from events for the given subscriptionId.
     */
    unsubscribeFrom(subscriptionIds: string[]): Promise<void>;
    /**
     * Generate subscription Query for the Inbox events.
     * @param {EventType} eventType type of event which you listen for
     * @param {EventSelectorType} selectorType scope on which you listen for events  
     * @param {string} selectorId ID of the selector
     */
    buildSubscriptionQuery(eventType: InboxEventType, selectorType: InboxEventSelectorType, selectorId: string): Promise<string>;

}

export class InboxEventsManager extends BaseEventManager {
    private moduleSubscriptions: string[] = [];
    private elementsSubscriptions: string[] = [];
    constructor(private inboxApi:SubscriberForInboxEvents) {
        super();
    }

    subscribeForModuleEvents(contextId: string): Promise<void> {
        return Promise.all([
            this.inboxApi.buildSubscriptionQuery(InboxEventType.INBOX_CREATE, InboxEventSelectorType.CONTEXT_ID, contextId),
            this.inboxApi.buildSubscriptionQuery(InboxEventType.INBOX_UPDATE, InboxEventSelectorType.CONTEXT_ID, contextId),
            this.inboxApi.buildSubscriptionQuery(InboxEventType.INBOX_DELETE, InboxEventSelectorType.CONTEXT_ID, contextId),
        ]).then(async queries => {
            this.moduleSubscriptions = this.moduleSubscriptions.concat(await this.inboxApi.subscribeFor(queries));
        })
    }
    subscribeForModuleElementsEvents(id: string){
        return Promise.all([
            this.inboxApi.buildSubscriptionQuery(InboxEventType.ENTRY_CREATE, InboxEventSelectorType.INBOX_ID, id),
            this.inboxApi.buildSubscriptionQuery(InboxEventType.ENTRY_DELETE, InboxEventSelectorType.INBOX_ID, id),
        ]).then(async queries => {
            this.elementsSubscriptions = this.elementsSubscriptions.concat(await this.inboxApi.subscribeFor(queries)); 
        })
    }
    unsubscribeFromModuleEvents(){
        return this.inboxApi.unsubscribeFrom(this.moduleSubscriptions);
    }
    unsubscribeFromModuleElementsEvents(id: string){return this.inboxApi.unsubscribeFrom([id])}

    async onInboxEvent(handler: OnInboxEventHandler) {
        const channel: Channel = 'inbox';
        return this.addContainerListener(channel, handler.event, handler.callback);
    }

    async onEntryEvent(inboxId: string, handler: OnEntryEventHandler) {
        const channel: Channel = `inbox/${inboxId}/entries`;
        return this.addContainerElementListener(inboxId, channel, handler.event, handler.callback);
    }
}

export class ConnectionEventsManager extends BaseEventManager {
    //Connection events don't have subscribe functions
    protected subscribeForModuleEvents() {
        return new Promise<void>((resolve) => resolve());
    }
    protected subscribeForModuleElementsEvents() {
        return new Promise<void>((resolve) => resolve());
    }
    protected unsubscribeFromModuleEvents() {
        return new Promise<void>((resolve) => resolve());
    }
    protected unsubscribeFromModuleElementsEvents() {
        return new Promise<void>((resolve) => resolve());
    }

    constructor(private connectionId: string) {
        super();
    }

    async onConnectionEvent(handler: OnConnectionHandler) {
        const channel: Channel = `connection/${this.connectionId}`;
        const removeListener = this.addContainerListener(channel, handler.event, handler.callback);
        return removeListener;
    }
}

export class EventManager {
    private _isEventLoopRunning = false;
    dispatchers: ((event: Types.Event) => void)[] = [];
    private eventsQueue: { waitEvent: () => Promise<Types.Event> } | null = null;

    constructor() {}

    private listenForEvents() {
        if (this.eventsQueue) {
            this.eventsQueue.waitEvent().then((event) => {
                this.onEvent(event);
                this.listenForEvents();
            });
        }
    }

    static startEventLoop(eventQueue: { waitEvent: () => Promise<Types.Event> }) {
        const manager = new EventManager();

        manager.eventsQueue = eventQueue;

        manager._isEventLoopRunning = true;

        manager.eventsQueue.waitEvent().then((event) => {
            if (!manager._isEventLoopRunning) return;
            manager.onEvent(event);
            manager.listenForEvents();
        });

        return manager;
    }

    stopEventLoop() {
        this._isEventLoopRunning = false;
    }

    removeAllDispatchers = (): void => {
        this.dispatchers = [];
    };

    protected onEvent(event: Types.Event) {
        this.dispatchers.forEach((cb) => cb(event));
    }

    registerDispatcher(manager: BaseEventManager) {
        this.dispatchers.push((e) => manager.dispatchEvent(e));
    }

    getThreadEventManager(threadApi: SubscriberForThreadsEvents) {
        const manager = new ThreadEventsManager(threadApi);
        this.registerDispatcher(manager);
        return manager;
    }

    getStoreEventManager(storeApi: SubscriberForStoreEvents) {
        const manager = new StoreEventsManager(storeApi);
        this.registerDispatcher(manager);
        return manager;
    }

    getInboxEventManager(inboxApi: SubscriberForInboxEvents) {
        const manager = new InboxEventsManager(inboxApi);
        this.registerDispatcher(manager);
        return manager;
    }

    getConnectionEventManager(connectionId: string) {
        const manager = new ConnectionEventsManager(connectionId);
        this.registerDispatcher(manager);
        return manager;
    }
}
