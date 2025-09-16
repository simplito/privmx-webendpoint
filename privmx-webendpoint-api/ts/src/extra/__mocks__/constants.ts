import { Types } from "../../index";

export function createBaseEvent(subsId: string) {
  return {
    type: "inboxCreated",
    data: {},
    channel: `inbox`,
    connectionId: 1,
    subscriptions: [subsId],
    version: 0,
    timestamp: Date.now(),
  };
}

export const MOCK_INBOX_CREATED_EVENT = (subsId: string) =>
  ({
    ...createBaseEvent(subsId),
    type: "inboxCreated",
    channel: `inbox`,
  }) satisfies Types.Event;

export const MOCK_INBOX_ENTRY_DELETED_EVENT = (
  inboxID: string,
  subsId: string,
) =>
  ({
    ...createBaseEvent(subsId),
    type: "inboxEntryDeleted",
    channel: `inbox/${inboxID}/entries`,
  }) as const;

export const MOCK_STORE_CREATED_EVENT = (subsId: string) => ({
  ...createBaseEvent(subsId),
  type: "storeUpdated",
  channel: `store`,
});

export const MOCK_STORE_FILE_DELETED_EVENT = (
  storeID: string,
  subsId: string,
) =>
  ({
    ...createBaseEvent(subsId),
    type: "storeFileCreated",
    channel: `store/${storeID}/files`,
  }) as const;

export const MOCK_THREAD_CREATED_EVENT = (subsId: string) => ({
  ...createBaseEvent(subsId),
  type: "threadUpdated",
  channel: `thread`,
});

export const MOCK_THREAD_MESSAGE_DELETED_EVENT = (
  threadID: string,
  subsId: string,
) =>
  ({
    ...createBaseEvent(subsId),
    type: "threadNewMessage",
    channel: `thread/${threadID}/messages`,
  }) as const;
