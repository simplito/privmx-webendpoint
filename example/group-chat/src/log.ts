/**
 * The demo's activity log: a plain external store, so anything - React
 * component or not - can append to it, and `useLog()` re-renders on a change.
 */
import { useSyncExternalStore } from "react";

let lines: readonly string[] = [];
const listeners = new Set<() => void>();

export function log(who: string, line: string): void {
    lines = [...lines, `[${who}] ${line}`];
    listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
    listeners.add(notify);
    return () => {
        listeners.delete(notify);
    };
}

export const useLog = (): readonly string[] => useSyncExternalStore(subscribe, () => lines);

/**
 * Wraps an async handler for use as an event handler: nothing in this demo has
 * anything better to do with a rejection than show it in the log.
 */
export const guard = (fn: () => Promise<unknown>) => () => {
    fn().catch((e) => log("error", (e as Error).message));
};
