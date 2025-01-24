/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/


#include <emscripten/bind.h>

#include "Endpoint.hpp"
#include "Macros.hpp"

EMSCRIPTEN_BINDINGS(webendpoint){
    BINDING_FUNCTION_MIN(setResultsCallback)

    BINDING_FUNCTION(EventQueue, newEventQueue)
    BINDING_FUNCTION(EventQueue, deleteEventQueue)
    BINDING_FUNCTION(EventQueue, emitBreakEvent)
    BINDING_FUNCTION(EventQueue, waitEvent)
    BINDING_FUNCTION(EventQueue, getEvent)

    BINDING_FUNCTION(Connection, newConnection)
    BINDING_FUNCTION(Connection, deleteConnection)
    BINDING_FUNCTION(Connection, connect)
    BINDING_FUNCTION(Connection, connectPublic)
    BINDING_FUNCTION(Connection, getConnectionId)
    BINDING_FUNCTION(Connection, listContexts)
    BINDING_FUNCTION(Connection, disconnect)

    BINDING_FUNCTION(ThreadApi, newThreadApi)
    BINDING_FUNCTION(ThreadApi, deleteThreadApi)
    BINDING_FUNCTION(ThreadApi, create)
    BINDING_FUNCTION(ThreadApi, createThread)
    BINDING_FUNCTION(ThreadApi, updateThread)
    BINDING_FUNCTION(ThreadApi, deleteThread)
    BINDING_FUNCTION(ThreadApi, getThread)
    BINDING_FUNCTION(ThreadApi, listThreads)
    BINDING_FUNCTION(ThreadApi, getMessage)
    BINDING_FUNCTION(ThreadApi, listMessages)
    BINDING_FUNCTION(ThreadApi, sendMessage)
    BINDING_FUNCTION(ThreadApi, deleteMessage)
    BINDING_FUNCTION(ThreadApi, updateMessage)
    BINDING_FUNCTION(ThreadApi, subscribeForThreadEvents)
    BINDING_FUNCTION(ThreadApi, unsubscribeFromThreadEvents)
    BINDING_FUNCTION(ThreadApi, subscribeForMessageEvents)
    BINDING_FUNCTION(ThreadApi, unsubscribeFromMessageEvents)

    BINDING_FUNCTION(StoreApi, newStoreApi)
    BINDING_FUNCTION(StoreApi, deleteStoreApi)
    BINDING_FUNCTION(StoreApi, create)
    BINDING_FUNCTION(StoreApi, createStore)
    BINDING_FUNCTION(StoreApi, updateStore)
    BINDING_FUNCTION(StoreApi, deleteStore)
    BINDING_FUNCTION(StoreApi, getStore)
    BINDING_FUNCTION(StoreApi, listStores)
    BINDING_FUNCTION(StoreApi, createFile)
    BINDING_FUNCTION(StoreApi, updateFile)
    BINDING_FUNCTION(StoreApi, updateFileMeta)
    BINDING_FUNCTION(StoreApi, writeToFile)
    BINDING_FUNCTION(StoreApi, deleteFile)
    BINDING_FUNCTION(StoreApi, getFile)
    BINDING_FUNCTION(StoreApi, listFiles)
    BINDING_FUNCTION(StoreApi, openFile)
    BINDING_FUNCTION(StoreApi, readFromFile)
    BINDING_FUNCTION(StoreApi, seekInFile)
    BINDING_FUNCTION(StoreApi, closeFile)
    BINDING_FUNCTION(StoreApi, subscribeForStoreEvents)
    BINDING_FUNCTION(StoreApi, unsubscribeFromStoreEvents)
    BINDING_FUNCTION(StoreApi, subscribeForFileEvents)
    BINDING_FUNCTION(StoreApi, unsubscribeFromFileEvents)

    BINDING_FUNCTION(InboxApi, newInboxApi)
    BINDING_FUNCTION(InboxApi, deleteInboxApi)
    BINDING_FUNCTION(InboxApi, create)
    BINDING_FUNCTION(InboxApi, createInbox)
    BINDING_FUNCTION(InboxApi, updateInbox)
    BINDING_FUNCTION(InboxApi, getInbox)
    BINDING_FUNCTION(InboxApi, listInboxes)
    BINDING_FUNCTION(InboxApi, getInboxPublicView)
    BINDING_FUNCTION(InboxApi, deleteInbox)
    BINDING_FUNCTION(InboxApi, prepareEntry)
    BINDING_FUNCTION(InboxApi, sendEntry)
    BINDING_FUNCTION(InboxApi, readEntry)
    BINDING_FUNCTION(InboxApi, listEntries)
    BINDING_FUNCTION(InboxApi, deleteEntry)
    BINDING_FUNCTION(InboxApi, createFileHandle)
    BINDING_FUNCTION(InboxApi, writeToFile)
    BINDING_FUNCTION(InboxApi, openFile)
    BINDING_FUNCTION(InboxApi, readFromFile)
    BINDING_FUNCTION(InboxApi, seekInFile)
    BINDING_FUNCTION(InboxApi, closeFile)
    BINDING_FUNCTION(InboxApi, subscribeForInboxEvents)
    BINDING_FUNCTION(InboxApi, unsubscribeFromInboxEvents)
    BINDING_FUNCTION(InboxApi, subscribeForEntryEvents)
    BINDING_FUNCTION(InboxApi, unsubscribeFromEntryEvents)

    BINDING_FUNCTION(CryptoApi, newCryptoApi)
    BINDING_FUNCTION(CryptoApi, deleteCryptoApi)
    BINDING_FUNCTION(CryptoApi, create)
    BINDING_FUNCTION(CryptoApi, signData)
    BINDING_FUNCTION(CryptoApi, generatePrivateKey)
    BINDING_FUNCTION(CryptoApi, derivePrivateKey)
    BINDING_FUNCTION(CryptoApi, derivePrivateKey_deprecated)
    BINDING_FUNCTION(CryptoApi, derivePublicKey)
    BINDING_FUNCTION(CryptoApi, generateKeySymmetric)
    BINDING_FUNCTION(CryptoApi, encryptDataSymmetric)
    BINDING_FUNCTION(CryptoApi, decryptDataSymmetric)
    BINDING_FUNCTION(CryptoApi, convertPEMKeytoWIFKey)
}
