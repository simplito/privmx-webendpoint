import { MockEventQueue } from "./mockEventQueue.js";
import { MockContainerSubscriber } from "./mockContainerSubscriber.js";
import { EventLoop } from "../../events/EventLoop.js";
import { EventManager, connectionStatusSubscriber } from "../../events/EventManager.js";

export async function utils<T>(cb: () => T): Promise<T> {
    return new Promise((resolve) => {
        setTimeout(() => resolve(cb()), 10);
    });
}

/**
 * Builds a unified {@link EventManager} wired to a mock event queue + loop.
 * Content modules resolve to a single shared {@link MockContainerSubscriber};
 * the `connection` module uses the real connection-status subscriber so that
 * normalized lib-events route correctly.
 */
export function createTestSetup(connectionId = "1") {
    const q = new MockEventQueue();
    const loop = EventLoop.start(q);
    const subscriber = new MockContainerSubscriber(q);
    const manager = new EventManager((module) =>
        module === "connection" ? connectionStatusSubscriber(connectionId) : subscriber,
    );
    loop.register(manager);
    return { q, loop, manager, subscriber };
}

export function waitForNextTick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
