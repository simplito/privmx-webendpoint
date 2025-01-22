export const MOCK_INBOX_CREATED_EVENT = {
    type: 'inboxCreated',
    data: {},
    channel: `inbox`,
    connectionId: 1
}as const

export const MOCK_INBOX_ENTRY_DELETED_EVENT = (inboxID:string) =>({
    type: 'inboxEntryDeleted',
    data: {},
    channel: `inbox/${inboxID}/entries`,
    connectionId: 1
})as const

export const MOCK_STORE_CREATED_EVENT = {
    type: 'storeUpdated',
    data: {},
    channel: `store`,
    connectionId: 1
}as const

export const MOCK_STORE_FILE_DELETED_EVENT = (storeID:string) =>({
    type: 'storeFileCreated',
    data: {},
    channel: `store/${storeID}/files`,
    connectionId: 1
})as const

export const MOCK_THREAD_CREATED_EVENT = {
    type: 'threadUpdated',
    data: {},
    channel: `thread`,
    connectionId: 1
}as const

export const MOCK_THREAD_MESSAGE_DELETED_EVENT = (threadID:string) =>({
    type: 'threadNewMessage',
    data: {},
    channel: `thread/${threadID}/messages`,
    connectionId: 1
})as const

