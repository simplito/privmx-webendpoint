/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#ifndef _PRIVMXLIB_WEBENDPOINT_ENDPOINT_HPP_
#define _PRIVMXLIB_WEBENDPOINT_ENDPOINT_HPP_

#include <emscripten/val.h>

#include "Macros.hpp"

namespace privmx {
namespace webendpoint {
namespace api {

    void setResultsCallback(emscripten::val callback);

    void EventQueue_newEventQueue(int taskId);
    void EventQueue_deleteEventQueue(int taskId, int ptr);
    API_FUNCTION_HEADER(EventQueue, emitBreakEvent)
    API_FUNCTION_HEADER(EventQueue, waitEvent)
    API_FUNCTION_HEADER(EventQueue, getEvent)

    void Connection_newConnection(int taskId);
    void Connection_deleteConnection(int taskId, int ptr);
    API_FUNCTION_HEADER(Connection, connect)
    API_FUNCTION_HEADER(Connection, connectPublic)
    API_FUNCTION_HEADER(Connection, getConnectionId)
    API_FUNCTION_HEADER(Connection, listContexts)
    API_FUNCTION_HEADER(Connection, disconnect)

    void ThreadApi_newThreadApi(int taskId, int connectionPtr);
    void ThreadApi_deleteThreadApi(int taskId, int ptr);
    API_FUNCTION_HEADER(ThreadApi, create)
    API_FUNCTION_HEADER(ThreadApi, createThread)
    API_FUNCTION_HEADER(ThreadApi, updateThread)
    API_FUNCTION_HEADER(ThreadApi, deleteThread)
    API_FUNCTION_HEADER(ThreadApi, getThread)
    API_FUNCTION_HEADER(ThreadApi, listThreads)
    API_FUNCTION_HEADER(ThreadApi, getMessage)
    API_FUNCTION_HEADER(ThreadApi, listMessages)
    API_FUNCTION_HEADER(ThreadApi, sendMessage)
    API_FUNCTION_HEADER(ThreadApi, deleteMessage)
    API_FUNCTION_HEADER(ThreadApi, updateMessage)
    API_FUNCTION_HEADER(ThreadApi, subscribeForThreadEvents)
    API_FUNCTION_HEADER(ThreadApi, unsubscribeFromThreadEvents)
    API_FUNCTION_HEADER(ThreadApi, subscribeForMessageEvents)
    API_FUNCTION_HEADER(ThreadApi, unsubscribeFromMessageEvents)

    void StoreApi_newStoreApi(int taskId, int connectionPtr);
    void StoreApi_deleteStoreApi(int taskId, int ptr);
    API_FUNCTION_HEADER(StoreApi, create)
    API_FUNCTION_HEADER(StoreApi, createStore)
    API_FUNCTION_HEADER(StoreApi, updateStore)
    API_FUNCTION_HEADER(StoreApi, deleteStore)
    API_FUNCTION_HEADER(StoreApi, getStore)
    API_FUNCTION_HEADER(StoreApi, listStores)
    API_FUNCTION_HEADER(StoreApi, createFile)
    API_FUNCTION_HEADER(StoreApi, updateFile)
    API_FUNCTION_HEADER(StoreApi, updateFileMeta)
    API_FUNCTION_HEADER(StoreApi, writeToFile)
    API_FUNCTION_HEADER(StoreApi, deleteFile)
    API_FUNCTION_HEADER(StoreApi, getFile)
    API_FUNCTION_HEADER(StoreApi, listFiles)
    API_FUNCTION_HEADER(StoreApi, openFile)
    API_FUNCTION_HEADER(StoreApi, readFromFile)
    API_FUNCTION_HEADER(StoreApi, seekInFile)
    API_FUNCTION_HEADER(StoreApi, closeFile)
    API_FUNCTION_HEADER(StoreApi, subscribeForStoreEvents)
    API_FUNCTION_HEADER(StoreApi, unsubscribeFromStoreEvents)
    API_FUNCTION_HEADER(StoreApi, subscribeForFileEvents)
    API_FUNCTION_HEADER(StoreApi, unsubscribeFromFileEvents)

    void InboxApi_newInboxApi(int taskId, int connectionPtr, int threadApiPtr, int storeApiPtr);
    void InboxApi_deleteInboxApi(int taskId, int ptr);
    API_FUNCTION_HEADER(InboxApi, create)
    API_FUNCTION_HEADER(InboxApi, createInbox)
    API_FUNCTION_HEADER(InboxApi, updateInbox)
    API_FUNCTION_HEADER(InboxApi, getInbox)
    API_FUNCTION_HEADER(InboxApi, listInboxes)
    API_FUNCTION_HEADER(InboxApi, getInboxPublicView)
    API_FUNCTION_HEADER(InboxApi, deleteInbox)
    API_FUNCTION_HEADER(InboxApi, prepareEntry)
    API_FUNCTION_HEADER(InboxApi, sendEntry)
    API_FUNCTION_HEADER(InboxApi, readEntry)
    API_FUNCTION_HEADER(InboxApi, listEntries)
    API_FUNCTION_HEADER(InboxApi, deleteEntry)
    API_FUNCTION_HEADER(InboxApi, createFileHandle)
    API_FUNCTION_HEADER(InboxApi, writeToFile)
    API_FUNCTION_HEADER(InboxApi, openFile)
    API_FUNCTION_HEADER(InboxApi, readFromFile)
    API_FUNCTION_HEADER(InboxApi, seekInFile)
    API_FUNCTION_HEADER(InboxApi, closeFile)
    API_FUNCTION_HEADER(InboxApi, subscribeForInboxEvents)
    API_FUNCTION_HEADER(InboxApi, unsubscribeFromInboxEvents)
    API_FUNCTION_HEADER(InboxApi, subscribeForEntryEvents)
    API_FUNCTION_HEADER(InboxApi, unsubscribeFromEntryEvents)

    void CryptoApi_newCryptoApi(int taskId);
    void CryptoApi_deleteCryptoApi(int taskId, int ptr);
    API_FUNCTION_HEADER(CryptoApi, create)
    API_FUNCTION_HEADER(CryptoApi, signData)
    API_FUNCTION_HEADER(CryptoApi, generatePrivateKey)
    API_FUNCTION_HEADER(CryptoApi, derivePrivateKey)
    API_FUNCTION_HEADER(CryptoApi, derivePublicKey)
    API_FUNCTION_HEADER(CryptoApi, generateKeySymmetric)
    API_FUNCTION_HEADER(CryptoApi, encryptDataSymmetric)
    API_FUNCTION_HEADER(CryptoApi, decryptDataSymmetric)
    API_FUNCTION_HEADER(CryptoApi, convertPEMKeytoWIFKey)

} // namespace api
} // namespace webendpoint
} // namespace privmx

#endif // _PRIVMXLIB_WEBENDPOINT_ENDPOINT_HPP_