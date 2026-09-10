/** Activity log shared by every pane; `useLog()` re-renders on a change. */
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

/** Wraps an async handler: nothing here has anything better to do with a rejection. */
export const guard = (fn: () => Promise<unknown>) => () => {
    fn().catch((e) => log("error", (e as Error).message));
};
