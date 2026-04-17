/**
 * Simple serial async queue.
 *
 * Items are enqueued synchronously and processed one at a time by the function
 * registered via `assignProcessorFunc`. Calling `processAll` while a drain is
 * already in progress returns the same in-flight promise, preventing concurrent
 * drains.
 */
export class Queue<T> {
    private items: T[] = [];
    private func: ((item: T) => Promise<void>) | undefined;
    private drainPromise: Promise<void> | undefined;

    /** Appends `item` to the back of the queue. */
    enqueue(item: T): void {
        this.items.push(item);
    }

    /**
     * Registers the async function used to process each item.
     * Must be called before `processAll`.
     */
    assignProcessorFunc(func: (item: T) => Promise<void>): void {
        this.func = func;
    }

    /**
     * Processes all currently queued items serially, then resolves.
     * If called while a drain is already running, joins the existing drain
     * promise rather than starting a new one.
     * @throws if no processor function has been assigned.
     */
    async processAll(): Promise<void> {
        if (this.drainPromise) {
            return this.drainPromise;
        }
        if (!this.func) {
            throw new Error("No task processor function assigned");
        }
        this.drainPromise = this.drain(this.func);
        try {
            await this.drainPromise;
        } finally {
            this.drainPromise = undefined;
        }
    }

    private async drain(func: (item: T) => Promise<void>): Promise<void> {
        let itemIndex = 0;
        while (this.items.length > 0) {
            const item = this.items.shift();
            if (!item) continue;
            const itemId = itemIndex++;
            try {
                await func(item);
            } catch (err) {
                console.error("Error while processing queue item", itemId, err);
                throw err;
            }
        }
    }
}
