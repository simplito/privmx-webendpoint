import { Types } from "../../index";
// import {Channel} from "../../managers";

export class MockEventQueue {
  queue: Types.Event[] = [];
  resolveCommand: { resolver: Function } | null = null;

  constructor() {}

  dispatchEvent(event: Types.Event) {
    this.queue.push(event);
    if (this.resolveCommand) {
      this.resolveCommand.resolver();
      this.resolveCommand = null;
    }
  }

  async waitEvent(): Promise<Types.Event> {
    const lockPromise = new Promise<Types.Event>((resolve) => {
      const event = this.queue.shift();
      //if there is event in queue resolve immediately
      if (event) {
        resolve(event);
      } else {
        //if not, lock promise and unlock it on new event
        this.resolveCommand = {
          resolver: () => {
            const event = this.queue.shift();
            if (event) {
              resolve(event);
            }
          },
        };
      }
    });
    return lockPromise;
  }

  async emitBreakEvent() {
    return new Promise<void>((resolve) => {
      resolve;
    });
  }
}
