export interface QueueTask<T> {
    func(item: T): Promise<void>;
}

export class Queue<T> implements Iterable<T> {
    private items: T[] = [];
    private func: ((item: T) => Promise<void>) | undefined;
    private processing: boolean = false;

    enqueue(item: T): void {
        this.items.push(item);
    }

    dequeue(): T | undefined {
        return this.items.shift();
    }

    peek(): T | undefined {
        return this.items[0];
    }

    get size(): number {
        return this.items.length;
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }

    clear(): void {
        this.items.length = 0;
    }

    toArray(): T[] {
        return this.items.slice();
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
        while (this.items.length > 0) {
            const item = this.items.shift(); // bierz pierwszy i usuwaj go z kolejki
            if (!item) continue;
            const randId = Math.random();
            console.log("Processing started.. randId:", randId);
            try {
                await this.func(item);
                await this.awaiter();
            } catch (err) {
                console.error("Error while processing queue item", randId, err);
            }
        }

        this.processing = false;
    }

    async awaiter() {
        return new Promise<void>(resolve => setTimeout(() => resolve(), 5000));
    }

    [Symbol.iterator](): Iterator<T> {
        let idx = 0;
        const arr = this.items;
        return {
            next(): IteratorResult<T> {
                if (idx < arr.length) return { value: arr[idx++], done: false };
                return { value: undefined as any, done: true };
            },
        };
    }
}