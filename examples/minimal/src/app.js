"use strict";

let listenForEventsPromise;
const Endpoint = PrivmxWebEndpoint.Endpoint;

const runSample = (async () => {
  const platformUrl = "http://localhost:9111";
  const solutionId = "924d3b49-5206-43ab-a1cc-7539e0b9977d";

  const userPubKey = "51WPnnGwztNPWUDEbhncYDxZCZWAFS4M9Yqv94N2335nL92fEn";
  const userPrivKey = "L3ycXibEzJm9t9swoJ4KtSmJsenHmmgRnYY79Q2TqfJMwTGaWfA7";
  const userId = "user1";
  
  const defaultListQuery = {skip: 0, limit: 100, sortOrder: "desc"};
  
  // Initialize Endpoint and its Wasm assets
  await Endpoint.setup("/public");  

  // listening for events
  const eventQueue = await Endpoint.getEventQueue();
  listenForEvents(eventQueue);

  // initialize Endpoint connection and Threads API
  const connection = await Endpoint.connect(userPrivKey, solutionId, platformUrl);
  const threadsApi = await Endpoint.createThreadApi(connection);

  const contexts = await connection.listContexts(defaultListQuery);
  const contextId = contexts.readItems[0].contextId;

  // get available threads
  const threads = await threadsApi.listThreads(contextId, defaultListQuery);
  console.log("threads...", threads);
  const threadId = threads.readItems[0].threadId;

  // subscribe for events in the selected thread and send a sample message to that thread
  await threadsApi.subscribeForMessageEvents(threadId);
  await threadsApi.sendMessage(threadId, strToUInt8("some public meta-data"), strToUInt8("some private meta-data"), strToUInt8("message_"+String(Math.random())));

  // get thread's messages
  const messages = await threadsApi.listMessages(threadId, defaultListQuery);
  console.log("messages", messages);
  console.log("messages in human-readable format", messages.readItems.map(x => {return {publicMeta: uInt8ToStr(x.publicMeta), privateMeta: uInt8ToStr(x.privateMeta), data: uInt8ToStr(x.data)}}));
});
runSample();


// helpers
function listenForEvents(eventQueue) {
  if (!listenForEventsPromise) {
    listenForEventsPromise = eventQueue.waitEvent();
    listenForEventsPromise.then(result => {
      console.log("onEvent", result);
      listenForEventsPromise = null;
      listenForEvents(eventQueue);
    })
  }
}

function strToUInt8(text) {
  return (new TextEncoder()).encode(text);
}

function uInt8ToStr(arr) {
  return (new TextDecoder()).decode(arr);
}


