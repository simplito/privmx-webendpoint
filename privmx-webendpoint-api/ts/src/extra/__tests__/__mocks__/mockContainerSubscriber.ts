import {MockEventQueue} from "./mockEventQueue";
import {Channel} from "../../events";
import {utils} from "./utils";

export abstract class MockContainerSubscriber {
    abstract containerChannel: Channel;

    abstract containerElementChannel(id: string): Channel;

    protected constructor(private queue: MockEventQueue) {
    }

    protected subscribeForContainerEvents(): Promise<void> {
        return utils<void>(() => {
            this.queue.registeredChannels.add(this.containerChannel);
        });
    }

    protected unsubscribeFromContainerEvents(): Promise<void> {
        return utils<void>(() => this.queue.registeredChannels.delete(this.containerChannel));
    }

    protected subscribeForContainerItemEvents(id: string): Promise<void> {
        return utils<void>(() =>
            this.queue.registeredChannels.add(this.containerElementChannel(id))
        );
    }

    protected unsubscribeFromContainerItemEvents(id: string): Promise<void> {
        return utils<void>(() =>
            this.queue.registeredChannels.delete(this.containerElementChannel(id))
        );
    }
}