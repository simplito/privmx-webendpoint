import { MockEventQueue } from "./mockEventQueue";

export class MockContainerSubscriber<E, S> {
  constructor(private queue: MockEventQueue) {}

  subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
    return Promise.resolve(
      subscriptionQueries.map(() => generateRandomString()),
    );
  }

  unsubscribeFrom(): Promise<void> {
    return Promise.resolve();
  }

  buildSubscriptionQuery(
    _eventType: E,
    _selectorType: S,
    _selectorId: string,
  ): Promise<string> {
    return Promise.resolve("");
  }
}

function generateRandomString(
  length = 10,
  charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}
