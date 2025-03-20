import {Endpoint, InboxApi} from "@simplito/privmx-webendpoint";

const SOLUTION_ID = "YOUR_SOLUTION_ID";
const BRIDGE_URL = "YOUR_BRIDGE_URL";
const CONTEXT_ID = "YOUR_CONTEXT_ID";

const PRIVATE_KEY = "YOUR_PRIVATE_KEY";
const USER_ID = "YOUR_USER_ID";
const PUBLIC_KEY = "YOUR_PUBLIC_KEY";

let inboxApi: InboxApi;
const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function setup() {
    if (inboxApi) {
        return inboxApi
    }
    await Endpoint.setup('/privmx-assets')
    const connection = await Endpoint.connect(PRIVATE_KEY,SOLUTION_ID, BRIDGE_URL)
    const threadApi = await Endpoint.createThreadApi(connection)
    const storeApi = await Endpoint.createStoreApi(connection)
    inboxApi = await Endpoint.createInboxApi(connection, threadApi, storeApi)

    return inboxApi
}

export async function submitForm(inboxName: string) {
    const inboxApi = await setup()

    const inboxPrivateMeta = {
        name:inboxName,
    }
    const inboxID = await inboxApi.createInbox(
        CONTEXT_ID,
        [{userId:USER_ID,pubKey:PUBLIC_KEY}],
        [{userId:USER_ID,pubKey:PUBLIC_KEY}],
        new Uint8Array(),
        encoder.encode(JSON.stringify(inboxPrivateMeta))
    )

    console.log(inboxID)

    //listing inboxes from context
    const inboxesList = await inboxApi.listInboxes(CONTEXT_ID, {skip: 0, limit: 100, sortOrder: "desc"})
    const decodedInboxes = inboxesList.readItems.map(inbox => {
        return {
            ...inbox,
            privateMeta:JSON.parse(decoder.decode(inbox.privateMeta))
        }
    })
    console.log("Fetched inboxes")
    console.log(decodedInboxes)
}
