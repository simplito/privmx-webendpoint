export class Queue<T> {
    private items: T[] = [];
    private func: ((item: T) => Promise<void>) | undefined;
    private processing: boolean = false;

    enqueue(item: T): void {
        this.items.push(item);
    }

    assignProcessorFunc(func: (item: T) => Promise<void>) {
        this.func = func;
    }

    async processAll() {
        if (this.processing) {
            return;
        }
        if (!this.func) {
            throw new Error("No task processor function assigned");
        }
        this.processing = true;
        let itemIndex = 0;
        while (this.items.length > 0) {
            const item = this.items.shift();
            if (!item) continue;
            const itemId = itemIndex++;
            try {
                await this.func(item);
            } catch (err) {
                console.error("Error while processing queue item", itemId, err);
            }
        }
        this.processing = false;
    }
}
