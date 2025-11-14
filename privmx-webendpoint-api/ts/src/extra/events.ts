import {Types} from "..";
import {
    ConnectionStatusEventType,
    SubscriberForInboxEvents,
    SubscriberForUserEvents,
    SubscriberForEvents,
    SubscriberForKvdbEvents,
    SubscriberForStoreEvents,
    SubscriberForThreadsEvents
} from "./subscriptions";
import {
    BaseEventDispatcherManager, ConnectionChannels,
    ConnectionEventsManager,
    CustomEventsManager,
    InboxEventsManager, KvdbEventsManager,
    StoreEventsManager,
    ThreadEventsManager,
    UserEventsManager
} from "./managers";


function normalizeConnectionEvent(e: Types.Event): Types.Event {
    switch (e.type) {
        case 'libDisconnected':
            return {...e, subscriptions: [`${e.connectionId}/${ConnectionChannels[ConnectionStatusEventType.LIB_DISCONNECTED]}`]}
        case 'libPlatformDisconnected':
            return {...e, subscriptions: [`${e.connectionId}/${ConnectionChannels[ConnectionStatusEventType.LIB_PLATFORM_DISCONNECTED]}`]}
        case 'libConnected':
            return {...e, subscriptions: [`${e.connectionId}/${ConnectionChannels[ConnectionStatusEventType.LIB_CONNECTED]}`]}
        default:
            return e
    }
}

export class EventManager {
    private _isEventLoopRunning = false;
    dispatchers: ((event: Types.Event) => void)[] = [];
    private eventsQueue: { waitEvent: () => Promise<Types.Event> } | null = null;

    constructor() {
    }

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
        this.dispatchers.forEach((cb) => cb(normalizeConnectionEvent(event)));
    }

    registerDispatcher(manager: BaseEventDispatcherManager) {
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

    getKvdbEventManager(kvdbApi: SubscriberForKvdbEvents) {
        const manager = new KvdbEventsManager(kvdbApi);
        this.registerDispatcher(manager);
        return manager;
    }

    getInboxEventManager(inboxApi: SubscriberForInboxEvents) {
        const manager = new InboxEventsManager(inboxApi);
        this.registerDispatcher(manager);
        return manager;
    }

    getCustomEventsManager(eventApi: SubscriberForEvents) {
        const manager = new CustomEventsManager(eventApi);
        this.registerDispatcher(manager);
        return manager;
    }

    getConnectionEventManager(connectionId: string) {
        const manager = new ConnectionEventsManager(connectionId);
        this.registerDispatcher(manager);
        return manager;
    }

    getUserEventsManager(connectionApi: SubscriberForUserEvents) {
        const manager = new UserEventsManager(connectionApi);
        this.registerDispatcher(manager);
        return manager;
    }
}
