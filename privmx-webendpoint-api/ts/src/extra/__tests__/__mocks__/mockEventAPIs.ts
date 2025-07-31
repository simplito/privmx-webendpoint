import {MockContainerSubscriber} from './mockContainerSubscriber';
import {MockEventQueue} from "./mockEventQueue";
import {Channel, SubscriberForInboxEvents, SubscriberForStoreEvents, SubscriberForThreadsEvents} from "../../events";
import { ThreadEventType, ThreadEventSelectorType } from '../../../Types';
import { StoreEventType, StoreEventSelectorType } from '../../../Types';
import { InboxEventType, InboxEventSelectorType } from '../../../Types';

export class MockThreadEventApi extends MockContainerSubscriber implements SubscriberForThreadsEvents {
    containerChannel: Channel = 'thread';

    containerElementChannel(id: string): Channel {
        return `thread/${id}/messages`;
    }

    constructor(queue: MockEventQueue) {
        super(queue);
    }
    subscribeFor(_subscriptionQueries: string[]): Promise<string[]> {
        throw new Error('Method not implemented.');
    }
    unsubscribeFrom(_subscriptionIds: string[]): Promise<void> {
        throw new Error('Method not implemented.');
    }
    buildSubscriptionQuery(_eventType: ThreadEventType, _selectorType: ThreadEventSelectorType, _selectorId: string): Promise<string> {
        throw new Error('Method not implemented.');
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
    subscribeFor(_subscriptionQueries: string[]): Promise<string[]> {
        throw new Error('Method not implemented.');
    }
    unsubscribeFrom(_subscriptionIds: string[]): Promise<void> {
        throw new Error('Method not implemented.');
    }
    buildSubscriptionQuery(_eventType: StoreEventType, _selectorType: StoreEventSelectorType, _selectorId: string): Promise<string> {
        throw new Error('Method not implemented.');
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
    subscribeFor(_subscriptionQueries: string[]): Promise<string[]> {
        throw new Error('Method not implemented.');
    }
    unsubscribeFrom(_subscriptionIds: string[]): Promise<void> {
        throw new Error('Method not implemented.');
    }
    buildSubscriptionQuery(_eventType: InboxEventType, _selectorType: InboxEventSelectorType, _selectorId: string): Promise<string> {
        throw new Error('Method not implemented.');
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