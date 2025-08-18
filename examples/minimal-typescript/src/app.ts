import {Endpoint, EventQueue, Types} from "@simplito/privmx-webendpoint";

export class App {
    // private listenForEventsPromise: Promise<EventQueue> | null;

    async testApi() {
        const bridgeUrl = "http://localhost:3000";
        const solutionId = "50f55e2a-393e-4d17-9e33-ad5119665025";
       
        const userPubKey = "51WPnnGwztNPWUDEbhncYDxZCZWAFS4M9Yqv94N2335nL92fEn";
        const userPrivKey = "L3ycXibEzJm9t9swoJ4KtSmJsenHmmgRnYY79Q2TqfJMwTGaWfA7";
        const userId = "user1";  
        
        const defaultPaging: Types.PagingQuery = {skip: 0, limit: 100, sortOrder: "asc"};
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
        // for (let i = 0; i < 1000; i++) {
        //     threadsApi.createThread(contextId, [{userId: userId, pubKey: userPubKey}],  [{userId: userId, pubKey: userPubKey}], new Uint8Array(), new Uint8Array());
        // }
        // get available threads
        console.time("threadlist");
        const threads = await threadsApi.listThreads(contextId, defaultPaging);
        console.timeEnd("threadlist");
        console.log(threads);
        // console.time("threadlist");
        // const threads2 = await threadsApi.listThreads(contextId, {...defaultPaging, skip: 500});
        // console.timeEnd("threadlist");
        // console.log(threads2);
        const tId = threads.readItems[0].threadId;
        // console.log(tId);
        let i = 0
        while(i < 20) {
            console.time("threadGet");
            const thread = await threadsApi.getThread("688b5a0ed9b223364fb5302d");
            console.timeEnd("threadGet");
            i++;
        }
        // console.log(thread);
        // console.log("threads...", threads);
        // const threadId = threads.readItems[0].threadId;

        // subscribe for events in the selected thread and send a sample message to that thread
        // await threadsApi.subscribeForMessageEvents(threadId);
        // await threadsApi.sendMessage(threadId, 
        //     this.strToUint8("some public meta-data"), 
        //     this.strToUint8("some private meta-data"), 
        //     this.strToUint8("message_" + String(Math.random()))
        // );

        // get thread's messages
        // const messages = await threadsApi.listMessages(threadId, defaultPaging);
        // console.log("messages", messages);
        // console.log("messages in human-readable format", 
            // messages.readItems.map(x => {return {publicMeta: this.uint8ToStr(x.publicMeta), privateMeta: this.uint8ToStr(x.privateMeta), data: this.uint8ToStr(x.data)}})
        // );
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
            events = eventQueue.waitEvent();
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
