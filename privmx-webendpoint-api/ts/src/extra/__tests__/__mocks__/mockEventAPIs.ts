import {MockContainerSubscriber} from './mockContainerSubscriber';
import {MockEventQueue} from "./mockEventQueue";
import {Channel, SubscriberForInboxEvents, SubscriberForStoreEvents, SubscriberForThreadsEvents} from "../../events";

export class MockThreadEventApi extends MockContainerSubscriber implements SubscriberForThreadsEvents {
    containerChannel: Channel = 'thread';

    containerElementChannel(id: string): Channel {
        return `thread/${id}/messages`;
    }

    constructor(queue: MockEventQueue) {
        super(queue);
    }

    subscribeForThreadEvents(): Promise<void> {
        return this.subscribeForContainerEvents();
    }

    unsubscribeFromThreadEvents(): Promise<void> {
        return this.unsubscribeFromContainerEvents();
    }

    subscribeForMessageEvents(threadId: string): Promise<void> {
        return this.subscribeForContainerItemEvents(threadId);
    }

    unsubscribeFromMessageEvents(threadId: string): Promise<void> {
        return this.unsubscribeFromContainerItemEvents(threadId);
    }
}

export class MockStoreEventApi extends MockContainerSubscriber implements SubscriberForStoreEvents {
    containerChannel: Channel = 'store';

    containerElementChannel(id: string): Channel {
        return `store/${id}/files`;
    }

    constructor(queue: MockEventQueue) {
        super(queue);
    }

    subscribeForStoreEvents(): Promise<void> {
        return this.subscribeForContainerEvents();
    }
    unsubscribeFromStoreEvents(): Promise<void> {
        return this.unsubscribeFromContainerEvents();
    }
    subscribeForFileEvents(storeId: string): Promise<void> {
        return this.subscribeForContainerItemEvents(storeId);
    }
    unsubscribeFromFileEvents(storeId: string): Promise<void> {
        return this.unsubscribeFromContainerItemEvents(storeId);
    }
}

export class MockInboxEventApi extends MockContainerSubscriber implements SubscriberForInboxEvents {
    containerChannel: Channel = 'inbox';

    containerElementChannel(id: string): Channel {
        return `inbox/${id}/entries`;
    }

    constructor(queue: MockEventQueue) {
        super(queue);
    }

    subscribeForInboxEvents(): Promise<void> {
        return this.subscribeForContainerEvents();
    }
    unsubscribeFromInboxEvents(): Promise<void> {
        return this.unsubscribeFromContainerEvents();
    }
    subscribeForEntryEvents(storeId: string): Promise<void> {
        return this.subscribeForContainerItemEvents(storeId);
    }
    unsubscribeFromEntryEvents(storeId: string): Promise<void> {
        return this.unsubscribeFromContainerItemEvents(storeId);
    }
}