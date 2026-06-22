/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import * as Types from "../Types.js";
import { ConnectionChannels, ConnectionStatusEventType } from "./subscriptions.js";

/**
 * Anything the {@link EventLoop} fans incoming events out to - implemented by
 * {@link EventManager}.
 * @internal
 */
export interface EventDispatchTarget {
    dispatchEvent(event: Types.Event): void;
}

/**
 * Rewrites the library's connection-state events (`libConnected`,
 * `libDisconnected`, `libPlatformDisconnected`) so their `subscriptions` field
 * carries the `<connectionId>/<channel>` key the connection-state subscriptions
 * are registered under. Other events pass through unchanged.
 * @param {Types.Event} e the incoming event
 * @returns {Types.Event} the event with connection-state subscriptions normalised
 */
function normalizeConnectionEvent(e: Types.Event): Types.Event {
    switch (e.type) {
        case "libDisconnected":
            return {
                ...e,
                subscriptions: [
                    `${e.connectionId}/${ConnectionChannels[ConnectionStatusEventType.LIB_DISCONNECTED]}`,
                ],
            };
        case "libPlatformDisconnected":
            return {
                ...e,
                subscriptions: [
                    `${e.connectionId}/${ConnectionChannels[ConnectionStatusEventType.LIB_PLATFORM_DISCONNECTED]}`,
                ],
            };
        case "libConnected":
            return {
                ...e,
                subscriptions: [
                    `${e.connectionId}/${ConnectionChannels[ConnectionStatusEventType.LIB_CONNECTED]}`,
                ],
            };
        default:
            return e;
    }
}

/**
 * Application-wide engine that pulls events off the global {@link EventQueue}
 * and fans each one (after normalisation) to every registered
 * {@link EventManager}. One instance per application - created lazily by
 * `EndpointFactory.getEventLoop()`; not part of the public API.
 * @internal
 */
export class EventLoop {
    private running = false;
    private readonly targets: EventDispatchTarget[] = [];
    private queue: { waitEvent: () => Promise<Types.Event> } | null = null;

    /**
     * Starts a loop consuming the given queue immediately.
     * @param {object} queue event queue to drive (`waitEvent()` source)
     * @returns {EventLoop} the running loop
     */
    static start(queue: { waitEvent: () => Promise<Types.Event> }): EventLoop {
        const loop = new EventLoop();
        loop.queue = queue;
        loop.running = true;
        loop.pump();
        return loop;
    }

    /**
     * Registers a dispatch target to receive every incoming event.
     * @param {EventDispatchTarget} target target to register
     */
    register(target: EventDispatchTarget): void {
        this.targets.push(target);
    }

    /**
     * Removes a previously registered dispatch target.
     * @param {EventDispatchTarget} target target to remove
     */
    unregister(target: EventDispatchTarget): void {
        const i = this.targets.indexOf(target);
        if (i !== -1) this.targets.splice(i, 1);
    }

    /** Stops the loop; no further events are dispatched. */
    stop(): void {
        this.running = false;
    }

    private pump(): void {
        if (!this.queue || !this.running) return;
        this.queue
            .waitEvent()
            .then((event) => {
                if (!this.running) return;
                const normalized = normalizeConnectionEvent(event);
                for (const target of this.targets) {
                    target.dispatchEvent(normalized);
                }
                this.pump();
            })
            .catch(() => {
                if (this.running) this.pump();
            });
    }
}
