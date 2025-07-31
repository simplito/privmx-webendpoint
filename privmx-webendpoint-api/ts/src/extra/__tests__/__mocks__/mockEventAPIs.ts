import {MockEventQueue} from "./mockEventQueue";
import {Channel, SubscriberForInboxEvents, SubscriberForStoreEvents, SubscriberForThreadsEvents, SubscriberForKvdbEvents} from "../../events";
import {ThreadEventType, ThreadEventSelectorType, StoreEventType, StoreEventSelectorType, InboxEventType, InboxEventSelectorType, KvdbEventType, KvdbEventSelectorType} from "../../../Types";

export class MockThreadEventApi implements SubscriberForThreadsEvents {
    constructor(private queue: MockEventQueue) {}

    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return subscriptionQueries.map((_, index) => `sub_${Date.now()}_${index}`);
    }

    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
    }

    async buildSubscriptionQuery(eventType: ThreadEventType, selectorType: ThreadEventSelectorType, selectorId: string): Promise<string> {
        return `thread_${eventType}_${selectorType}_${selectorId}`;
    }
}

export class MockStoreEventApi implements SubscriberForStoreEvents {
    constructor(private queue: MockEventQueue) {}

    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return subscriptionQueries.map((_, index) => `sub_${Date.now()}_${index}`);
    }

    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
    }

    async buildSubscriptionQuery(eventType: StoreEventType, selectorType: StoreEventSelectorType, selectorId: string): Promise<string> {
        return `store_${eventType}_${selectorType}_${selectorId}`;
    }
}

export class MockInboxEventApi implements SubscriberForInboxEvents {
    constructor(private queue: MockEventQueue) {}

    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return subscriptionQueries.map((_, index) => `sub_${Date.now()}_${index}`);
    }

    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
    }

    async buildSubscriptionQuery(eventType: InboxEventType, selectorType: InboxEventSelectorType, selectorId: string): Promise<string> {
        return `inbox_${eventType}_${selectorType}_${selectorId}`;
    }
}

export class MockKvdbEventApi implements SubscriberForKvdbEvents {
    constructor(private queue: MockEventQueue) {}

    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return subscriptionQueries.map((_, index) => `sub_${Date.now()}_${index}`);
    }

    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
    }

    async buildSubscriptionQuery(eventType: KvdbEventType, selectorType: KvdbEventSelectorType, selectorId: string): Promise<string> {
        return `kvdb_${eventType}_${selectorType}_${selectorId}`;
    }
}