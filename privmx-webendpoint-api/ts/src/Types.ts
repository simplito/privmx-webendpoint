/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { ExtKey } from "./service/ExtKey";

// export namespace core {
    export type SortOrder = "desc" | "asc";
    
    /**
     * Holds Event details
     * 
     * @type {Event}
     * 
     * @param {string} type event type
     * @param {string} channel channel
     * @param {number} connectionId id of source connection
     * 
     */
    export interface Event {
        type: string;
        channel: string;
        connectionId: number;
        data?: unknown;
    };
    
    /**
     * Contains query parameters for methods returning lists (PagingList)
     * 
     * @type {PagingQuery}
     * 
     * @param {number} skip number of elements to skip from result
     * @param {number} limit limit of elements to return for query
     * @param {SortOrder} sortOrder Order of elements in result. Use "asc" for ascending, "desc" for descending.
     * @param {string} [lastId] id of the element from which query results should start
     * @param {string} [queryAsJson] extra query parameters in serialized JSON
     */
    export interface PagingQuery {
        skip: number;
        limit: number;
        sortOrder: SortOrder;
        lastId?: string;
        queryAsJson?: string;
    };

    /**
    * Contains results of listing methods
    * 
    * @type {PagingList<T>}
    * 
    * @param {number} totalAvailable total items available to get
    * @param {T[]} readItems list of items read during single method call
    * 
    */
    export interface PagingList<T> {
        totalAvailable: number;
        readItems: T[];
    };
    
    /**
     * Contains base Context information
     * 
     * @type {Context}
     * 
     * @param {string} userId ID of user requesting information
     * @param {string} contextId ID of context
     * 
     */
    export interface Context {
        userId: string;
        contextId: string;
    };
    
    /**
     * Contains ID of user and the corresponding public key
     * 
     * @type {UserWithPubKey}
     * 
     * @param {string} userId ID of the user
     * @param {string} pubKey user's public key
     * 
     */
    export interface UserWithPubKey {
        userId: string;
        pubKey: string;
    };

    /**
     * Contains Information about user
     *
     * @type {UserInfo}
     * 
     * @param {UserWithPubKey} user User publicKey and userId
     * @param {boolean} isActive is user connected to the Bridge
     * 
     */
    export interface UserInfo {
        user: UserWithPubKey;
        isActive: boolean;
    };
// }

// export namespace thread {

    /**
     * Holds all available information about a Thread.
     * 
     * @type {Thread}
     * 
     * @param {string} contextId ID of the Context
     * @param {string} threadId ID ot the Thread
     * @param {number} createDate Thread creation timestamp
     * @param {string} author ID of the user who created the Thread
     * @param {number} lastModificationDate Thread last modification timestamp
     * @param {string} lastModifier ID of the user who last modified the Thread
     * @param {string[]} users list of users (their IDs) with access to the Thread
     * @param {string[]} managers list of users (their IDs) with management rights
     * @param {number} version version number (changes on updates)
     * @param {number} lastMsgDate timestamp of last posted message
     * @param {Uint8Array} publicMeta Thread's public metadata
     * @param {Uint8Array} privateMeta Thread's private metadata
     * @param {ContainerPolicy} policy Thread's policies
     * @param {number} messagesCount total number of messages in the Thread
     * @param {number} statusCode status code of retrieval and decryption of the Thread
     * 
     */
    export interface Thread {
        contextId: string;
        threadId: string;
        createDate: number;
        creator: string;
        lastModificationDate: number;
        lastModifier: string;
        users: string[];
        managers: string[];
        version: number;
        lastMsgDate: number;
        publicMeta: Uint8Array;
        privateMeta: Uint8Array;
        policy: ContainerPolicy;
        messagesCount: number;
        statusCode: number;
    };
    
    /**
     * Holds information about the Message.
     * 
     * @type {Message}
     * 
     * @param {ServerMessageInfo} info message's information created by server
     * @param {Uint8Array} publicMeta message's public metadata
     * @param {Uint8Array} privateMeta message's private metadata
     * @param {Uint8Array} data message's data
     * @param {string} authorPubKey public key of an author of the message
     * @param {number} statusCode status code of retrieval and decryption of the message
     * 
     */
    export interface Message {
        info: ServerMessageInfo;
        publicMeta: Uint8Array;
        privateMeta: Uint8Array;
        data: Uint8Array;
        authorPubKey: string;
        statusCode: number;
    };
    
    /**
     * Holds message's information created by server
     * 
     * @type {ServerMessageInfo}
     * 
     * @param {string} threadId ID of the Thread
     * @param {string} messageId ID of the message
     * @param {number} createDate message's creation timestamp
     * @param {string} author ID of the user who created the message
     * 
     */
    export interface ServerMessageInfo {
        threadId: string;
        messageId: string;
        createDate: number;
        author: string;
    };
// }

// export namespace store {
    /**
     * Holds all available information about a Store.
     * 
     * @type {Store}
     * 
     * @param {string} storeId ID ot the Store
     * @param {string} contextId ID of the Context
     * @param {number} createDate Store creation timestamp
     * @param {string} creator ID of user who created the Store
     * @param {number} lastModificationDate Thread last modification timestamp
     * @param {number} lastFileDate timestamp of last created file
     * @param {string} lastModifier ID of the user who last modified the Store
     * @param {string[]} users list of users (their IDs) with access to the Store
     * @param {string[]} managers list of users (their IDs) with management rights
     * @param {number} version version number (changes on updates)
     * @param {Uint8Array} publicMeta Store's public metadata
     * @param {Uint8Array} privateMeta Store's private metadata
     * @param {ContainerPolicy} policy Store's policies
     * @param {number} filesCount total number of files in the Store
     * @param {number} statusCode status code of retrieval and decryption of the Store
     * 
     */
    export interface Store {
        storeId: string;
        contextId: string;
        createDate: number;
        creator: string;
        lastModificationDate: number;
        lastFileDate: number;
        lastModifier: string;
        users: string[];
        managers: string[];
        version: number;
        publicMeta: Uint8Array;
        privateMeta: Uint8Array;
        policy: ContainerPolicy;
        filesCount: number;
        statusCode: number;
    };

    /**
     * Holds information about the file.
     * 
     * @type {File}
     * 
     * @param {ServerFileInfo} info file's information created by server
     * @param {Uint8Array} publicMeta file's public metadata
     * @param {Uint8Array} privateMeta file's private metadata
     * @param {number} size file's size
     * @param {string} authorPubKey public key of an author of the file
     * @param {number} tatusCode status code of retrieval and decryption of the file
     * 
     */    
    export interface File {
        info: ServerFileInfo;
        publicMeta: Uint8Array;
        privateMeta: Uint8Array;
        size: number;
        authorPubKey: string;
        statusCode: number;
    };
    
    /**
     * Holds file's information created by server
     * 
     * @type {ServerFileInfo}
     * 
     * @param {string} storeId ID of the Store
     * @param {string} fileId ID of the file
     * @param {number} createDate file's creation timestamp
     * @param {string} author ID of the user who created the file
     * 
     */    
    export interface ServerFileInfo {
        storeId: string;
        fileId: string;
        createDate: number;
        author: string;
    };
// }

// export namespace inbox {
    /**
     * Holds all available information about an Inbox.
     * 
     * @type {Inbox}
     * 
     * @param {string} inboxId ID ot the Inbox
     * @param {string} contextId ID of the Context
     * @param {number} createDate Inbox creation timestamp
     * @param {string} creator ID of user who created the Inbox
     * @param {number} lastModificationDate Inbox last modification timestamp
     * @param {string} lastModifier ID of the user who last modified the Inbox
     * @param {string[]} users list of users (their IDs) with access to the Inbox
     * @param {string[]} managers list of users (their IDs) with management rights
     * @param {number} version version number (changes on updates)
     * @param {Uint8Array} publicMeta Inbox' public metadata
     * @param {Uint8Array} privateMeta Inbox' private metadata
     * @param {FilesConfig} filesConfig Inbox' files configuration
     * @param {ContainerWithoutItemPolicy} policy Inbox' policies
     * @param {number} statusCode status code of retrieval and decryption of the Inbox
     * 
     */
    export interface Inbox {
        inboxId: string;
        contextId: string;
        createDate: number;
        creator: string;
        lastModificationDate: number;
        lastModifier: string;
        users: string[];
        managers: string[];
        version: number;
        publicMeta: Uint8Array;
        privateMeta: Uint8Array;
        filesConfig?: FilesConfig;
        policy: ContainerWithoutItemPolicy;
        statusCode: number;        
    };
    /**
     * Holds Inbox' public information
     * 
     * @type {InboxPublicView}
     * 
     * @param {string} inboxId ID of the Inbox
     * @param {number} version version of the Inbox
     * @param {Uint8Array} publicMeta Inbox' public metadata
     * 
     */
    export interface InboxPublicView {
        inboxId: string;
        version: number;
        publicMeta: Uint8Array;
    };

    /**
     * Holds information about Inbox' entry
     * 
     * @type {InboxEntry}
     * 
     * @param {string} entryId ID of the entry
     * @param {string} inboxId ID of the Inbox
     * @param {Uint8Array} data entry data
     * @param {File[]} files list of files attached to the entry
     * @param {string} authorPubKey public key of the author of an entry
     * @param {number} createDate Inbox entry creation timestamp
     * @param {number} statusCode status code of retrieval and decryption of the Inbox entry
     */
    export interface InboxEntry {
        entryId: string;
        inboxId: string;
        data: Uint8Array;
        files: File[];
        authorPubKey: string;
        createDate: number;
        statusCode: number;
    };

    /**
     * Holds Inbox files configuration
     * 
     * @type {FilesConfig}
     * 
     * @param {int64_t} minCount minimum number of files required when sending inbox entry
     * @param {int64_t} maxCount maximum number of files allowed when sending inbox entry
     * @param {int64_t} maxFileSize maximum file size allowed when sending inbox entry
     * @param {int64_t} maxWholeUploadSize maximum size of all files in total allowed when sending inbox entry
     * 
     */
    export interface FilesConfig {
        minCount: number;
        maxCount: number;
        maxFileSize: number;
        maxWholeUploadSize: number;
    };
    
    
    /**
     * Holds Container policies settings
     * 
     * @type {ContainerWithoutItemPolicy}
     * 
     * @param {PolicyEntry} get determine who can get a container
     * @param {PolicyEntry} update determine who can update a container
     * @param {PolicyEntry} delete determine who can delete a container
     * @param {PolicyEntry} updatePolicy determine who can update the policy of a container
     * @param {PolicyBooleanEntry} updaterCanBeRemovedFromManagers determine whether the updater can be removed from the list of managers
     * @param {PolicyBooleanEntry} ownerCanBeRemovedFromManagers determine whether the owner can be removed from the list of managers
     */
    export interface ContainerWithoutItemPolicy {
        get?: PolicyEntry;
        update?: PolicyEntry;
        delete?: PolicyEntry;
        updatePolicy?: PolicyEntry;
        updaterCanBeRemovedFromManagers?: PolicyBooleanEntry;
        ownerCanBeRemovedFromManagers?: PolicyBooleanEntry;
    }
    
    /**
     * Holds Container policies settings
     * 
     * @type {ContainerPolicy}
     * 
     * @param {ItemPolicy} item item policies
     */
    export interface ContainerPolicy extends ContainerWithoutItemPolicy {
        item?: ItemPolicy;
    }
    
    /**
     * @type {PolicyEntry}
     */
    export type PolicyEntry = "inherit"|"yes"|"no"|"default"|"none"|"all"|"user"|"owner"|"manager"|"itemOwner"|"itemOwner&user"|"itemOwner&user,manager"|"owner&user"|"manager&owner"|"itemOwner,manager"|"itemOwner,owner"|"itemOwner,manager,owner"|"manager,owner"|(string&{__policyEntry: never});

    /**
     * @type {PolicyBooleanEntry}
     */
    export type PolicyBooleanEntry = "inherit"|"default"|"yes"|"no";
    
    /**
     * Holds Container's item policies settings
     * 
     * @type {ContainerWithoutItemPolicy}
     * 
     * @param {PolicyEntry} get determine who can get an item
     * @param {PolicyEntry} listMy determine who can list items created by me
     * @param {PolicyEntry} listAll determine who can list all items
     * @param {PolicyEntry} create determine who can create an item
     * @param {PolicyEntry} update determine who can update an item
     * @param {PolicyEntry} delete determine who can delete an item
     */
    export interface ItemPolicy {
        get?: PolicyEntry;
        listMy?: PolicyEntry;
        listAll?: PolicyEntry;
        create?: PolicyEntry;
        update?: PolicyEntry;
        delete?: PolicyEntry;
    }
    
// }

/**
 * Holds error details
 * 
 * @type {Error}
 * 
 * @param {number} code error code
 * @param {string} name error name
 * @param {string} scope error scope
 * @param {string} description error description
 * @param {string} full all available data about the error
 * 
 */
export interface Error {
    code: number;
    name: string;
    scope: string;
    description: string;
    full: string
}
/**
 * @param {string} mnemonic BIP-39 mnemonic
 * @param {ExtKey} extKey Ecc Key
 * @param {Uint8Array} entropy BIP-39 entropy
*/
export interface BIP39 {
    mnemonic: string;
    entropy: Uint8Array;
    extKey: ExtKey;
};

/**
 * 
 * @type {VerificationRequest}
 * 
 * @param {string} contextId Id of the Context
 * @param {string} senderId Id of the sender
 * @param {string} senderPubKey Public key of the sender
 * @param {number} date The data creation date
 * @param {BridgeIdentity} bridgeIdentity Bridge Identity
 */
export interface VerificationRequest {
    contextId: string;
    senderId: string;
    senderPubKey: string;
    date: number;
    bridgeIdentity?: BridgeIdentity;
};

/**
 * Bridge server identification details.
 * 
 * @type {BridgeIdentity}
 * 
 * @param {string} url Bridge URL
 * @param {string} pubKey Bridge public Key
 * @param {string} instanceId Bridge instance Id given by PKI
 */
export interface BridgeIdentity {
    url: string;
    pubKey?: string;
    instanceId?: string;
}