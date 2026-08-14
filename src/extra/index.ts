import * as Files from "./files.js";
import * as Utils from "./utils.js";
import * as Generics from "./generics.js";
import * as Inboxes from "./inbox.js";

import { FileUploader, StreamReader, downloadFile } from "./files.js";
import { PrivmxClient } from "./PrivmxClient.js";
import { PublicConnection } from "./PublicConnection.js";

// Event infrastructure now lives in the core `../events` module; re-exported
// here for backwards compatibility with `@simplito/privmx-webendpoint/extra`.
export {
    EventManager,
    createInboxSubscription,
    createThreadSubscription,
    createConnectionSubscription,
    createUserEventSubscription,
    createKvdbSubscription,
    createStoreSubscription,
    createEventSubscription,
    ConnectionStatusEventType,
} from "../events/index.js";
export type { EventCallback, EventSubscription } from "../events/index.js";

export {
    Files,
    Inboxes,
    Utils,
    Generics,
    FileUploader,
    downloadFile,
    StreamReader,
    PrivmxClient,
    PublicConnection,
};
