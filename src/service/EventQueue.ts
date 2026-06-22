/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi.js";
import { EventQueueNative } from "../native/EventQueueNative.js";
import { Event } from "../Types.js";

/**
 * Blocking queue delivering server events (new messages, container changes,
 * connection state, …) to the application, one at a time.
 *
 * There is a single, global queue per application — obtain it via
 * {@link EndpointFactory.getEventQueue}; do not construct it directly. Events
 * arrive only for subjects you subscribed to first (e.g.
 * `ThreadApi.subscribeFor`, `Connection.subscribeFor`).
 *
 * Most applications should not consume this class directly: the connection's
 * event manager (`connection.getEventManager()`) runs the wait-loop for you and
 * dispatches typed callbacks.
 *
 * For manual consumption it is async-iterable, so the typical loop is
 * `subscribeFor(...)` → `for await (const event of queue) { … }` → call
 * {@link emitBreakEvent} to end the loop. Alternatively drive {@link waitEvent}
 * yourself.
 */
export class EventQueue extends BaseApi implements AsyncIterable<Event> {
    private deferedPromise: Promise<Event> | null = null;
    /**
     * Created by `EndpointFactory.getEventQueue()` — never
     * constructed by SDK users.
     * @internal
     */
    constructor(
        private native: EventQueueNative,
        ptr: number,
    ) {
        super(ptr);
    }

    /**
     * Waits until the next event is available and returns it (long-poll; the
     * promise stays pending indefinitely while no event arrives).
     *
     * Delegates to the WASM core's blocking event queue, which is fed by the
     * Bridge server over the connection's event channel. Concurrent callers
     * share one pending wait: all of them receive the same next event, and a
     * new wait starts only after it resolves.
     *
     * Call in a loop to drive event handling, after subscribing via the
     * relevant API's `subscribeFor`. To make a pending `waitEvent` return
     * without a real server event (e.g. to stop the loop), call
     * {@link emitBreakEvent}.
     *
     * @returns {Event} the next event; inspect `event.type` / `event.channel`
     *   to route it. A break event injected by {@link emitBreakEvent} has type
     *   `"libBreak"`.
     */
    async waitEvent(): Promise<Event> {
        if (!this.deferedPromise) {
            this.deferedPromise = this.native.waitEvent(this.servicePtr, []);
            this.deferedPromise.finally(() => (this.deferedPromise = null));
        }
        return this.deferedPromise;
    }

    /**
     * Async-iterates over incoming events so the queue can be consumed with
     * `for await (const event of queue) { … }` instead of a manual
     * {@link waitEvent} loop.
     *
     * Iteration ends when a break event is injected via {@link emitBreakEvent}:
     * the `"libBreak"` event is consumed (not yielded), so the loop exits
     * cleanly without a manual `break`. `break`ing out of the `for await` also
     * stops it.
     *
     * @yields {Event} each server event as it arrives, until a break event ends
     *   the loop
     */
    async *[Symbol.asyncIterator](): AsyncIterableIterator<Event> {
        for (;;) {
            const event = await this.waitEvent();
            if (event.type === "libBreak") {
                return;
            }
            yield event;
        }
    }

    /**
     * Injects an artificial "libBreak" event into the queue, causing the
     * pending (or next) {@link waitEvent} to resolve with it.
     *
     * The event is generated locally in the WASM core — nothing is sent to the
     * server. Use it to wake up and terminate an event-processing loop
     * gracefully (it ends a `for await (… of queue)` loop), e.g. before
     * {@link Connection.disconnect}.
     * @returns {Promise<void>} resolves when the break event has been injected into the queue
     */
    async emitBreakEvent(): Promise<void> {
        return this.native.emitBreakEvent(this.servicePtr, []);
    }
}
