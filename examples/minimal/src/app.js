"use strict";

let listenForEventsPromise;


const runSample = (async () => {
  const userPrivKey = "L3ycXibEzJm9t9swoJ4KtSmJsenHmmgRnYY79Q2TqfJMwTGaWfA7";
  const userPubKey = "51WPnnGwztNPWUDEbhncYDxZCZWAFS4M9Yqv94N2335nL92fEn";
  const platformUrl = "http://localhost:9111/";
  const solutionId = "6716bb7950041e112ddeaf18";
  
  const defaultListQuery = {skip:0, limit: 100, sortOrder: "desc"};
  
  // listening for events
  const eventQueue = await EndpointFactory.getEventQueue();
  listenForEvents(eventQueue);

  // initialize Endpoint connection and Threads API
  const connection = await EndpointFactory.connect(userPrivKey, solutionId, platformUrl);
  const threadsApi = await EndpointFactory.createThreadApi(connection);

  const contexts = await connection.listContexts(defaultListQuery);
  const contextId = contexts.readItems[0].contextId;

  // get available threads
  const threads = await threadsApi.listThreads(contextId, defaultListQuery);
  console.log("threads", threads);
  const threadId = threads.readItems[0].threadId;

  // subscribe for events in the selected thread and send a sample message to that thread
  await threadsApi.subscribeForMessageEvents(threadId);
  await threadsApi.sendMessage(threadId, strToUInt8("some public meta-data"), strToUInt8("some private meta-data"), strToUInt8("message_"+String(Math.random())));

  // get thread's messages
  const messages = await threadsApi.listMessages(threadId, defaultListQuery);
  console.log("messages", messages);
  console.log("messages in human-readable format", messages.readItems.map(x => {return {publicMeta: uInt8ToStr(x.publicMeta), privateMeta: uInt8ToStr(x.privateMeta), data: uInt8ToStr(x.data)}}));
});

window.addEventListener('libInitialized', () => runSample());


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


