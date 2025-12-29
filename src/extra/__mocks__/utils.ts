import { MockEventQueue } from "./mockEventQueue";
import { EventManager } from "../events";

export async function utils<T>(cb: () => T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(cb()), 10);
  });
}

export function createTestSetup() {
  const q = new MockEventQueue();
  const mockEventsManager = EventManager.startEventLoop(q);
  return { q, manager: mockEventsManager };
}

export function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
