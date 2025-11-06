import {Endpoint, EventQueue, Types} from "@simplito/privmx-webendpoint";

export class App {
    // private listenForEventsPromise: Promise<EventQueue> | null;

    async testApi() {
        const bridgeUrl = "http://localhost:9111";
        const solutionId = "8c5bfd97-1cce-4975-a4f2-134235ea0401";
    
        const userPubKey = "51WPnnGwztNPWUDEbhncYDxZCZWAFS4M9Yqv94N2335nL92fEn";
        const userPrivKey = "L3ycXibEzJm9t9swoJ4KtSmJsenHmmgRnYY79Q2TqfJMwTGaWfA7";
        const userId = "user1";
        
        const defaultPaging: Types.PagingQuery = {skip: 0, limit: 100, sortOrder: "desc"};
        const defaultUsers: Types.UserWithPubKey[] = [{userId: userId, pubKey: userPubKey}];

        // Initialize Endpoint and its Wasm assets
        await Endpoint.setup("/public");  

        // listening for events
        const eventQueue = await Endpoint.getEventQueue();
        this.listenForEvents(eventQueue);
        
        // initialize Endpoint connection and Threads API
        const connection = await Endpoint.connect(userPrivKey, solutionId, bridgeUrl);
        const threadsApi = await Endpoint.createThreadApi(connection);

        const contexts = await connection.listContexts(defaultPaging);
        const contextId = contexts.readItems[0].contextId;

        // get available threads
        const threads = await threadsApi.listThreads(contextId, defaultPaging);
        console.log("threads...", threads);

        
        const threadId =  await (async () => {
            if (threads.readItems.length > 0) {
                return threads.readItems[0].threadId;
            }
            return await threadsApi.createThread(contextId, [{pubKey: userPubKey, userId: userId}], [{pubKey: userPubKey, userId: userId}], new Uint8Array(), new Uint8Array());
        })()

        // subscribe for events in the selected thread and send a sample message to that thread
        // await threadsApi.subscribeForMessageEvents(threadId);
        await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );
          await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );  await threadsApi.sendMessage(threadId, 
            this.strToUint8("some public meta-data"), 
            this.strToUint8("some private meta-data"), 
            this.strToUint8("message_" + String(Math.random()))
        );

        // get thread's messages
        const messages = await threadsApi.listMessages(threadId, defaultPaging);
        console.log("messages", messages);
        console.log("messages in human-readable format", 
            messages.readItems.map(x => {return {publicMeta: this.uint8ToStr(x.publicMeta), privateMeta: this.uint8ToStr(x.privateMeta), data: this.uint8ToStr(x.data)}})
        );
        await connection.disconnect();
    }


    // listenForEvents(eventQueue: EventQueue) {
    //     if (!this.listenForEventsPromise) {
    //       this.listenForEventsPromise = eventQueue.waitEvent();
    //       this.listenForEventsPromise = this.listenForEventsPromise.then(result => {
    //         console.log("onEvent", result);
    //         this.listenForEventsPromise = null;
    //         listenForEvents(eventQueue);
    //       })
    //     }
    //   }

    listenForEvents(eventQueue: EventQueue) {
        let events = eventQueue.waitEvent();
        console.log("events", events);

        events.then(event => {
            console.log("onEvent", event);
            this.listenForEvents(eventQueue);
        })
    }

    uint8ToStr(arr: Uint8Array) {
        return (new TextDecoder()).decode(arr);
    }

    strToUint8(text: string) {
        return (new TextEncoder()).encode(text);
    }
}
new App().testApi();
