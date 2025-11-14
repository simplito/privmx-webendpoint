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

export const MOCK_CONNECTION_USER_ADDED_EVENT = (
  subsId: string,
): Types.Event => ({
  ...createBaseEvent(subsId),
  type: "contextUserAdded",
  channel: "context/userAdded",
  data: {
    contextId: "ctx-1",
    user: {
      userId: "user-1",
      pubKey: "pub-1",
    },
  } satisfies Types.ContextUserEventData,
});

export const MOCK_CONNECTION_USER_STATUS_EVENT = (
  subsId: string,
): Types.Event => ({
  ...createBaseEvent(subsId),
  type: "contextUserStatusChanged",
  channel: "context/userStatus",
  data: {
    contextId: "ctx-1",
    users: [
      {
        user: {
          userId: "user-1",
          pubKey: "pub-1",
        },
        action: "login",
      },
    ],
  } satisfies Types.ContextUsersStatusChangedEventData,
});

export const MOCK_LIB_CONNECTED_EVENT = (
  connectionId: number,
): Types.Event => ({
  ...createBaseEvent("ignored"),
  type: "libConnected",
  channel: "channel/lib_connected",
  connectionId,
});

export const MOCK_CUSTOM_EVENT = (
  subsId: string,
  contextId = "ctx-1",
  channelName = "custom-channel",
): Types.Event => ({
  ...createBaseEvent(subsId),
  type: "contextCustom",
  channel: `context/${contextId}/${channelName}`,
  data: {
    contextId,
    userId: "user-1",
    payload: new Uint8Array([1, 2, 3]),
    statusCode: 0,
    schemaVersion: 5,
  } satisfies Types.ContextCustomEventData,
});
