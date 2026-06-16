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
 * Most applications should not consume this class directly: the `/extra` event
 * managers (`EventManager.startEventLoop(queue)`, `PrivmxClient.getEventManager()`)
 * run the wait-loop for you and dispatch typed callbacks.
 *
 * Typical manual loop: `subscribeFor(...)` → `while (running) { const e = await
 * queue.waitEvent(); … }` → `emitBreakEvent()` to stop the loop.
 */
export class EventQueue extends BaseApi {
    private deferedPromise: Promise<Event> | null = null;
    /**
     * @internal Created by `EndpointFactory.getEventQueue()` — never
     * constructed by SDK users.
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
     * Injects an artificial "libBreak" event into the queue, causing the
     * pending (or next) {@link waitEvent} to resolve with it.
     *
     * The event is generated locally in the WASM core — nothing is sent to the
     * server. Use it to wake up and terminate an event-processing loop
     * gracefully, e.g. before {@link Connection.disconnect}; the `/extra`
     * `EventManager.stopEventLoop()` uses this mechanism.
     */
    async emitBreakEvent(): Promise<void> {
        return this.native.emitBreakEvent(this.servicePtr, []);
    }
}
