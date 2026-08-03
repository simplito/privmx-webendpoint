/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import * as Types from "../Types.js";
import {
    ConnectionChannels,
    ConnectionStatusEventType,
    EventCallback,
    EventModule,
    EventSubscriber,
    EventSubscription,
} from "./subscriptions.js";

/**
 * Resolves a subscription's {@link EventModule} to the API that performs the
 * subscribe/unsubscribe/query for it (e.g. `thread` → the connection's
 * `ThreadApi`). Provided by `Connection.getEventManager()`.
 * @internal
 */
export type EventSubscriberResolver = (
    module: EventModule,
) => EventSubscriber<unknown, unknown> | Promise<EventSubscriber<unknown, unknown>>;

/**
 * Builds the synthetic subscriber used for connection-state events. There is no
 * server-side subscription: the "queries" are the local `<connectionId>/<channel>`
 * keys (matched against {@link EventLoop}-normalised events), and unsubscribe is
 * a no-op.
 * @internal
 * @param {string} connectionId id of the connection whose state to track
 * @returns {EventSubscriber<ConnectionStatusEventType, unknown>} the synthetic subscriber
 */
export function connectionStatusSubscriber(
    connectionId: string,
): EventSubscriber<ConnectionStatusEventType, unknown> {
    return {
        subscribeFor: (queries) => Promise.resolve(queries),
        unsubscribeFrom: () => Promise.resolve(),
        buildSubscriptionQuery: (eventType) =>
            Promise.resolve(`${connectionId}/${ConnectionChannels[eventType]}`),
    };
}

/**
 * The single event manager for a connection. Subscribe to events of **any**
 * module (Threads, Stores, Inboxes, KVDBs, custom Context events, user/Context
 * membership and connection-state) through one object, mixing modules freely in
 * a single {@link subscribe} call.
 *
 * Obtain it from `connection.getEventManager()` (or `PrivmxClient.getEventManager()`),
 * which wires it into the shared application-wide event loop. Build subscriptions
 * with the typed `create*Subscription` helpers so callbacks receive a strongly
 * typed `event.data`.
 *
 * @example
 * const events = await connection.getEventManager();
 * const ids = await events.subscribe([
 *   createThreadSubscription({
 *     type: Types.ThreadEventType.MESSAGE_CREATE,
 *     selector: Types.ThreadEventSelectorType.THREAD_ID,
 *     id: threadId,
 *     callbacks: [(e) => console.log(e.data)], // typed as Message
 *   }),
 *   createStoreSubscription({ ... }),
 * ]);
 * await events.unsubscribe(ids);
 */
export class EventManager {
    private readonly listeners = new Map<string, EventCallback[]>();
    private readonly idToModule = new Map<string, EventModule>();

    /**
     * Created by `Connection.getEventManager()`; not constructed directly.
     * @internal
     * @param {EventSubscriberResolver} resolveSubscriber maps a module to its API
     */
    constructor(private readonly resolveSubscriber: EventSubscriberResolver) {}

    /**
     * Invoked by the event loop for each incoming event; routes it to the
     * callbacks registered for the event's subscription ids.
     * @internal
     * @param {Types.Event} event the (normalised) incoming event
     * @returns {void}
     */
    dispatchEvent(event: Types.Event): void {
        for (const subscriptionId of event.subscriptions) {
            const callbacks = this.listeners.get(subscriptionId);
            if (!callbacks) continue;
            for (const cb of callbacks) {
                cb(event);
            }
        }
    }

    /**
     * Registers subscriptions across any modules. Each subscription is routed to
     * its module's API to build the query and subscribe; callbacks then fire for
     * matching events. Build the entries with the `create*Subscription` helpers.
     *
     * @param {EventSubscription[]} subscriptions subscriptions to register
     * @returns {Promise<string[]>} subscription ids (pass to {@link unsubscribe})
     */
    async subscribe(subscriptions: EventSubscription[]): Promise<string[]> {
        const byModule = new Map<EventModule, EventSubscription[]>();
        for (const subscription of subscriptions) {
            const group = byModule.get(subscription.module) ?? [];
            group.push(subscription);
            byModule.set(subscription.module, group);
        }

        const allIds: string[] = [];
        for (const [module, group] of byModule) {
            const subscriber = await this.resolveSubscriber(module);
            const queries = await Promise.all(
                group.map((s) =>
                    subscriber.buildSubscriptionQuery(
                        s.type as never,
                        (s as { selector?: unknown }).selector as never,
                        (s as { id?: string }).id as string,
                    ),
                ),
            );
            const ids = await subscriber.subscribeFor(queries);
            ids.forEach((id, i) => {
                this.listeners.set(id, group[i].callbacks);
                this.idToModule.set(id, module);
            });
            allIds.push(...ids);
        }
        return allIds;
    }

    /**
     * Cancels the given subscriptions and removes their callbacks. Ids are routed
     * back to the module they were created on; unknown ids are ignored.
     *
     * @param {string[]} subscriptionIds ids returned by {@link subscribe}
     * @returns {Promise<void>} resolves once the known subscriptions are removed
     */
    async unsubscribe(subscriptionIds: string[]): Promise<void> {
        const byModule = new Map<EventModule, string[]>();
        for (const id of subscriptionIds) {
            const module = this.idToModule.get(id);
            if (!module) continue;
            this.listeners.delete(id);
            this.idToModule.delete(id);
            const group = byModule.get(module) ?? [];
            group.push(id);
            byModule.set(module, group);
        }

        for (const [module, ids] of byModule) {
            const subscriber = await this.resolveSubscriber(module);
            await subscriber.unsubscribeFrom(ids);
        }
    }
}
