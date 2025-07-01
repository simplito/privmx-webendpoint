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
#include <emscripten.h>
#include <emscripten/bind.h>
#include "Macros.hpp"
#include "Mapper.hpp"

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
    API_FUNCTION_HEADER(Connection, getContextUsers)
    API_FUNCTION_HEADER(Connection, disconnect)
    void Connection_newUserVerifierInterface(int taskId, int connectionPtr);
    void Connection_deleteUserVerifierInterface(int taskId, int ptr);
    emscripten::val callVerifierOnJS(emscripten::val& name, emscripten::val& params);

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

    void KvdbApi_newKvdbApi(int taskId, int connectionPtr);
    void KvdbApi_deleteKvdbApi(int taskId, int ptr);
    API_FUNCTION_HEADER(KvdbApi, create)
    API_FUNCTION_HEADER(KvdbApi, createKvdb)
    API_FUNCTION_HEADER(KvdbApi, updateKvdb)
    API_FUNCTION_HEADER(KvdbApi, deleteKvdb)
    API_FUNCTION_HEADER(KvdbApi, getKvdb)
    API_FUNCTION_HEADER(KvdbApi, listKvdbs)
    API_FUNCTION_HEADER(KvdbApi, getEntry)
    API_FUNCTION_HEADER(KvdbApi, hasEntry)
    API_FUNCTION_HEADER(KvdbApi, listEntriesKeys)
    API_FUNCTION_HEADER(KvdbApi, listEntries)
    API_FUNCTION_HEADER(KvdbApi, setEntry)
    API_FUNCTION_HEADER(KvdbApi, deleteEntry)
    API_FUNCTION_HEADER(KvdbApi, deleteEntries)
    API_FUNCTION_HEADER(KvdbApi, subscribeForKvdbEvents)
    API_FUNCTION_HEADER(KvdbApi, unsubscribeFromKvdbEvents)
    API_FUNCTION_HEADER(KvdbApi, subscribeForEntryEvents)
    API_FUNCTION_HEADER(KvdbApi, unsubscribeFromEntryEvents)


    void CryptoApi_newCryptoApi(int taskId);
    void CryptoApi_deleteCryptoApi(int taskId, int ptr);
    API_FUNCTION_HEADER(CryptoApi, create)
    API_FUNCTION_HEADER(CryptoApi, signData)
    API_FUNCTION_HEADER(CryptoApi, verifySignature)
    API_FUNCTION_HEADER(CryptoApi, generatePrivateKey)
    API_FUNCTION_HEADER(CryptoApi, derivePrivateKey)
    API_FUNCTION_HEADER(CryptoApi, derivePrivateKey2)
    API_FUNCTION_HEADER(CryptoApi, derivePublicKey)
    API_FUNCTION_HEADER(CryptoApi, generateKeySymmetric)
    API_FUNCTION_HEADER(CryptoApi, encryptDataSymmetric)
    API_FUNCTION_HEADER(CryptoApi, decryptDataSymmetric)
    API_FUNCTION_HEADER(CryptoApi, convertPEMKeytoWIFKey)
    API_FUNCTION_HEADER(CryptoApi, generateBip39)
    API_FUNCTION_HEADER(CryptoApi, fromMnemonic)
    API_FUNCTION_HEADER(CryptoApi, fromEntropy)
    API_FUNCTION_HEADER(CryptoApi, entropyToMnemonic)
    API_FUNCTION_HEADER(CryptoApi, mnemonicToEntropy)
    API_FUNCTION_HEADER(CryptoApi, mnemonicToSeed)

    void EventApi_newEventApi(int taskId, int connectionPtr);
    void EventApi_deleteEventApi(int taskId, int ptr);
    API_FUNCTION_HEADER(EventApi, create)
    API_FUNCTION_HEADER(EventApi, emitEvent)
    API_FUNCTION_HEADER(EventApi, subscribeForCustomEvents)
    API_FUNCTION_HEADER(EventApi, unsubscribeFromCustomEvents)

    void ExtKey_deleteExtKey(int taskId, int ptr);
    void ExtKey_fromSeed(int taskId, emscripten::val args);
    void ExtKey_fromBase58(int taskId, emscripten::val args);
    void ExtKey_generateRandom(int taskId, emscripten::val args);
    API_FUNCTION_HEADER(ExtKey, derive)
    API_FUNCTION_HEADER(ExtKey, deriveHardened)
    API_FUNCTION_HEADER(ExtKey, getPrivatePartAsBase58)
    API_FUNCTION_HEADER(ExtKey, getPublicPartAsBase58)
    API_FUNCTION_HEADER(ExtKey, getPrivateKey)
    API_FUNCTION_HEADER(ExtKey, getPublicKey)
    API_FUNCTION_HEADER(ExtKey, getPrivateEncKey)
    API_FUNCTION_HEADER(ExtKey, getPublicKeyAsBase58Address)
    API_FUNCTION_HEADER(ExtKey, getChainCode)
    API_FUNCTION_HEADER(ExtKey, verifyCompactSignatureWithHash)
    API_FUNCTION_HEADER(ExtKey, isPrivate)

    void StreamApi_newStreamApi(int taskId, int connectionPtr, int eventsPtr);
    void StreamApi_deleteStreamApi(int taskId, int ptr);
    API_FUNCTION_HEADER(StreamApi, create)
    API_FUNCTION_HEADER(StreamApi, createStreamRoom)
    API_FUNCTION_HEADER(StreamApi, updateStreamRoom)
    API_FUNCTION_HEADER(StreamApi, deleteStreamRoom)
    API_FUNCTION_HEADER(StreamApi, getStreamRoom)
    API_FUNCTION_HEADER(StreamApi, listStreamRooms)
    API_FUNCTION_HEADER(StreamApi, createStream)
    API_FUNCTION_HEADER(StreamApi, publishStream)
    API_FUNCTION_HEADER(StreamApi, unpublishStream)
    API_FUNCTION_HEADER(StreamApi, joinStream)
    API_FUNCTION_HEADER(StreamApi, listStreams)
    API_FUNCTION_HEADER(StreamApi, leaveStream)
    API_FUNCTION_HEADER(StreamApi, keyManagement)
    API_FUNCTION_HEADER(StreamApi, getTurnCredentials)


} // namespace api
} // namespace webendpoint
} // namespace privmx

#endif // _PRIVMXLIB_WEBENDPOINT_ENDPOINT_HPP_
