import {Endpoint, InboxApi} from "@simplito/privmx-webendpoint";

const SOLUTION_ID = "YOUR_SOLUTION_ID";
const BRIDGE_URL = "YOUR_BRIDGE_URL";
const INBOX_ID = "YOUR_INBOX_ID";

let inboxApi: InboxApi;
const encoder = new TextEncoder()

async function setup() {
    if (inboxApi) {
        return inboxApi
    }
    await Endpoint.setup('/privmx-assets')
    const connection = await Endpoint.connectPublic(SOLUTION_ID, BRIDGE_URL)
    const threadApi = await Endpoint.createThreadApi(connection)
    const storeApi = await Endpoint.createStoreApi(connection)
    inboxApi = await Endpoint.createInboxApi(connection, threadApi, storeApi)

    return inboxApi
}

export async function submitForm(message: string) {
    const inboxApi = await setup()

    const entryHandle = await inboxApi.prepareEntry(INBOX_ID, encoder.encode(message), [])
    await inboxApi.sendEntry(entryHandle);
    console.log("Entry Sent")
}
