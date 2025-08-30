import {Endpoint, EventQueue, Types} from "@simplito/privmx-webendpoint";

export class App {
    // private listenForEventsPromise: Promise<EventQueue> | null;

    async testApi() {
        const platformUrl = "http://localhost:3000";
        const solutionId = "34cdcbdf-8ec6-461f-a154-510d9d531a32";

        const userPubKey = "6GdpXA9ro6hDabKKFsnuq4EJ1NYNLqsnLzTLCAyL55FMSk8xSM";
        const userPrivKey = "Kx9ftJtfa4Af941f9jYR44dKxv9uWMxkJBk3XgdSYy6M5i6zcXxS";
        const userId = "user_1";
        
        const defaultPaging: Types.PagingQuery = {skip: 0, limit: 100, sortOrder: "desc"};
        const defaultUsers: Types.UserWithPubKey[] = [{userId: userId, pubKey: userPubKey}];

        // Initialize Endpoint and its Wasm assets
        await Endpoint.setup("/public");  

        // listening for events
        const eventQueue = await Endpoint.getEventQueue();
        this.listenForEvents(eventQueue);
        
        // initialize Endpoint connection and Kvdbs API
        const connection = await Endpoint.connect(userPrivKey, solutionId, platformUrl);
        const kvdbsApi = await Endpoint.createKvdbApi(connection);
        const contexts = await connection.listContexts(defaultPaging);
        const contextId = contexts.readItems[0].contextId;

        // get available kvdbs
        const kvdbs = await kvdbsApi.listKvdbs(contextId, defaultPaging);
        console.log("kvdbs...", kvdbs);
        let kvdbId: string;
        if(kvdbs.totalAvailable < 1) {
            kvdbId = await kvdbsApi.createKvdb(
                contextId,
                [{userId:userId,pubKey:userPubKey}],
                [{userId:userId,pubKey:userPubKey}],
                this.strToUint8("some public meta-data"), 
                this.strToUint8("some private meta-data")
            );
            console.log("new kvdb...", kvdbId);
        } else {
            kvdbId = kvdbs.readItems[0].kvdbId;
        }
        
        // subscribe for events in the selected kvdb and send a sample message to that kvdb
        await kvdbsApi.subscribeForEntryEvents(kvdbId);
        const entries = await kvdbsApi.listEntries(
            kvdbId,
            {skip: 0, limit: 100, sortOrder: "desc"}
        )

        console.log("entries...", entries);
        let entry_key: string = "";
        if(entries.totalAvailable < 1) {
            await kvdbsApi.setEntry(
                kvdbId, 
                "entry_key",
                this.strToUint8("some public meta-data"), 
                this.strToUint8("some private meta-data"), 
                this.strToUint8("some entry data"), 
                0
            );
            entry_key = "entry_key";
        } else {
            await kvdbsApi.setEntry(
                kvdbId, 
                entries.readItems[0].info.key,
                this.strToUint8("some public meta-data"), 
                this.strToUint8("some private meta-data"), 
                this.strToUint8("some entry data"), 
                entries.readItems[0].version
            );
            entry_key = entries.readItems[0].info.key;
        }

        const entry = await kvdbsApi.getEntry(kvdbId, entry_key);
        console.log("entry", entry);
    }


    listenForEvents(eventQueue: EventQueue) {
        let events = eventQueue.waitEvent();
        console.log("events", events);

        events.then(event => {
            console.log("onEvent", event);
            this.listenForEvents(eventQueue);
        });
    }

    uint8ToStr(arr: Uint8Array) {
        return (new TextDecoder()).decode(arr);
    }

    strToUint8(text: string) {
        return (new TextEncoder()).encode(text);
    }
}
new App().testApi();
