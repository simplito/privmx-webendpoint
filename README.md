## PrivMX Web Endpoint
PrivMX Web Endpoint is a JavaScript library designed to work in browser environment. It is used by applications and devices which are the ends of PrivMX secure communication channels. It encrypts and decrypts data, manages network connections and provides a functional API on the top of the WebAssembly build made of the native PrivMX Endpoint library written in C++. This allows applications to build their E2EE communication channels based on a few universal, client-side encrypted tools: Threads, Stores, and Inboxes. 

Initialization of the application’s Endpoint requires providing an address of the application’s Bridge and the user's private key.

### Sample usage
The sample code below is an example of how you can start using low-level PrivMX Web Endpoint library and its API.

### Initial requirements for connecting with Web Endpoint to PrivMX Bridge

To use the library's elements in a JS app, you have to provide:

1. PrivMX Web Endpoint address (platformUrl):

```
https://<your_instance_of_bridge_server:port>
```

2. SolutionId:

```
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

3. Make PrivMX Web Endpoint library's assets available for your application:
```
driver-web-context.js
endpoint-wasm-module.wasm
endpoint-wasm-module.worker.js
endpoint-wasm-module.js
privmx-endpoint-web.js
```


#### You must also ensure that:

1. There is an appropriate context with assigned users on the Bridge Server side.

2. The users have pairs of public and private keys (`Pubkey` and `PrivKey`) and the user's private key is known in the app.

3. Public keys of all the users are added to the `Context`.


### `sample.js`:

``` js
let listenForEventsPromise;


const runSample = (async () => {
  const  userPrivKey = "<context_user_priv_key>";
  const  userPubKey = "<context_user_pub_key";
  const  platformUrl = "http://localhost:9111";
  const  solutionId = "<solution_id>";
  
  const defaultListQuery = {skip:0, limit: 100, sortOrder: "desc"};
  
  // listening for events
  const eventQueue = await EndpointFactory.getEventQueue();
  listenForEvents(eventQueue);

  // initialize Endpoint connection and Threads API
  const connection = await EndpointFactory.platformConnect(userPrivKey, solutionId, platformUrl);
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
```
A complete project that uses the above code example can be found [here](https://github.com/simplito/privmx-webendpoint/examples/minimal).

For more detailed information about API functions, visit https://docs.privmx.dev.