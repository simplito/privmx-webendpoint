export class Queue<T> {
    private items: T[] = [];
    private func: ((item: T) => Promise<void>) | undefined;
    private drainPromise: Promise<void> | undefined;

    enqueue(item: T): void {
        this.items.push(item);
    }

    assignProcessorFunc(func: (item: T) => Promise<void>) {
        this.func = func;
    }

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
            }
        }
    }
}
