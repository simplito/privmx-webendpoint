/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#include "Endpoint.hpp"

#include <privmx/endpoint/crypto/varinterface/ExtKeyVarInterface.hpp>
#include <privmx/endpoint/core/varinterface/EventQueueVarInterface.hpp>
#include <privmx/endpoint/core/varinterface/ConnectionVarInterface.hpp>
#include <privmx/endpoint/thread/varinterface/ThreadApiVarInterface.hpp>
#include <privmx/endpoint/store/varinterface/StoreApiVarInterface.hpp>
#include <privmx/endpoint/inbox/varinterface/InboxApiVarInterface.hpp>
#include <privmx/endpoint/kvdb/varinterface/KvdbApiVarInterface.hpp>
#include <privmx/endpoint/crypto/varinterface/CryptoApiVarInterface.hpp>
#include <privmx/endpoint/event/varinterface/EventApiVarInterface.hpp>
#include "privmx/endpoint/core/VarDeserializer.hpp"
#include "privmx/endpoint/core/VarSerializer.hpp"
#include <privmx/endpoint/core/UserVerifierInterface.hpp>

#include "CustomUserVerifierInterface.hpp"

#include "Macros.hpp"
#include "Mapper.hpp"
#include "ProxyedTaskRunner.hpp"
#include <emscripten/threading.h>
#include <emscripten/proxying.h>



using namespace privmx::endpoint;
using namespace privmx::webendpoint;
using namespace privmx::webendpoint::api;

using EventQueueVar = privmx::endpoint::core::EventQueueVarInterface;
using ConnectionVar = privmx::endpoint::core::ConnectionVarInterface;
using ThreadApiVar = privmx::endpoint::thread::ThreadApiVarInterface;
using StoreApiVar = privmx::endpoint::store::StoreApiVarInterface;
using InboxApiVar = privmx::endpoint::inbox::InboxApiVarInterface;
using KvdbApiVar = privmx::endpoint::kvdb::KvdbApiVarInterface;
using CryptoApiVar = privmx::endpoint::crypto::CryptoApiVarInterface;
using EventApiVar = privmx::endpoint::event::EventApiVarInterface;
using ExtKeyVar = privmx::endpoint::crypto::ExtKeyVarInterface;

using UserVerifierInterface = privmx::endpoint::core::UserVerifierInterface;
using VerificationRequest = privmx::endpoint::core::VerificationRequest;
namespace privmx {
namespace webendpoint {
namespace api {

    void setResultsCallback(emscripten::val callback){
        ProxyedTaskRunner::getInstance()->setResultsCallback(callback);
    }

    void EventQueue_newEventQueue(int taskId) {
        ProxyedTaskRunner::getInstance()->runTask(taskId, [&]{
            auto service = new EventQueueVar(core::EventQueue::getInstance(), core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});
            return (int)service;
        });
    }
    void EventQueue_deleteEventQueue(int taskId, int ptr) {
        ProxyedTaskRunner::getInstance()->runTaskVoid(taskId, [&, ptr]{
            delete (EventQueueVar*)ptr;
        });
    }
    API_FUNCTION(EventQueue, emitBreakEvent)
    API_FUNCTION(EventQueue, waitEvent)
    API_FUNCTION(EventQueue, getEvent)

    void Connection_newConnection(int taskId) {
        ProxyedTaskRunner::getInstance()->runTask(taskId, [&]{
            auto service = new ConnectionVar(core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});
            return (int)service;
        });
    }
    void Connection_deleteConnection(int taskId, int ptr) {
        ProxyedTaskRunner::getInstance()->runTaskVoid(taskId, [&, ptr]{
            delete (ConnectionVar*)ptr;
        });
    }
    API_FUNCTION(Connection, connect)
    API_FUNCTION(Connection, connectPublic)
    API_FUNCTION(Connection, getConnectionId)
    API_FUNCTION(Connection, listContexts)
    API_FUNCTION(Connection, listContextUsers)
    API_FUNCTION(Connection, subscribeFor)
    API_FUNCTION(Connection, unsubscribeFrom)
    API_FUNCTION(Connection, buildSubscriptionQuery)
    API_FUNCTION(Connection, disconnect)

    void Connection_newUserVerifierInterface(int taskId, int connectionPtr, int interfaceBindId) {
        ProxyedTaskRunner::getInstance()->runTask(taskId, [&, connectionPtr, interfaceBindId]{
            auto connection = (ConnectionVar*)connectionPtr;
            auto customInterfaceRawPtr = new UserVerifierHolder();
            connection->getApi().setUserVerifier(customInterfaceRawPtr->getInstance(interfaceBindId));
            return (int)customInterfaceRawPtr;
        });
    }

    void Connection_deleteUserVerifierInterface(int taskId, int ptr) {
        ProxyedTaskRunner::getInstance()->runTaskVoid(taskId, [&, ptr]{
            delete (UserVerifierHolder*)ptr;
        });
    }

    void ThreadApi_newThreadApi(int taskId, int connectionPtr) {
        ProxyedTaskRunner::getInstance()->runTask(taskId, [&, connectionPtr]{
            auto connection = (ConnectionVar*)connectionPtr;
            auto threadApi = new ThreadApiVar(connection->getApi(), core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});
            return (int)threadApi;
        });
    }
    void ThreadApi_deleteThreadApi(int taskId, int ptr) {
        ProxyedTaskRunner::getInstance()->runTaskVoid(taskId, [&, ptr]{
            delete (ThreadApiVar*)ptr;
        });
    }
    API_FUNCTION(ThreadApi, create)
    API_FUNCTION(ThreadApi, createThread)
    API_FUNCTION(ThreadApi, updateThread)
    API_FUNCTION(ThreadApi, deleteThread)
    API_FUNCTION(ThreadApi, getThread)
    API_FUNCTION(ThreadApi, listThreads)
    API_FUNCTION(ThreadApi, getMessage)
    API_FUNCTION(ThreadApi, listMessages)
    API_FUNCTION(ThreadApi, sendMessage)
    API_FUNCTION(ThreadApi, deleteMessage)
    API_FUNCTION(ThreadApi, updateMessage)
    API_FUNCTION(ThreadApi, subscribeFor)
    API_FUNCTION(ThreadApi, unsubscribeFrom)
    API_FUNCTION(ThreadApi, buildSubscriptionQuery)

    void StoreApi_newStoreApi(int taskId, int connectionPtr) {
        ProxyedTaskRunner::getInstance()->runTask(taskId, [&, connectionPtr]{
            auto connection = (ConnectionVar*)connectionPtr;
            auto threadApi = new StoreApiVar(connection->getApi(), core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});
            return (int)threadApi;
        });
    }
    void StoreApi_deleteStoreApi(int taskId, int ptr) {
        ProxyedTaskRunner::getInstance()->runTaskVoid(taskId, [&, ptr]{
            delete (StoreApiVar*)ptr;
        });
    }
    API_FUNCTION(StoreApi, create)
    API_FUNCTION(StoreApi, createStore)
    API_FUNCTION(StoreApi, updateStore)
    API_FUNCTION(StoreApi, deleteStore)
    API_FUNCTION(StoreApi, getStore)
    API_FUNCTION(StoreApi, listStores)
    API_FUNCTION(StoreApi, createFile)
    API_FUNCTION(StoreApi, updateFile)
    API_FUNCTION(StoreApi, updateFileMeta)
    API_FUNCTION(StoreApi, writeToFile)
    API_FUNCTION(StoreApi, deleteFile)
    API_FUNCTION(StoreApi, getFile)
    API_FUNCTION(StoreApi, listFiles)
    API_FUNCTION(StoreApi, openFile)
    API_FUNCTION(StoreApi, readFromFile)
    API_FUNCTION(StoreApi, seekInFile)
    API_FUNCTION(StoreApi, closeFile)
    API_FUNCTION(StoreApi, subscribeFor)
    API_FUNCTION(StoreApi, unsubscribeFrom)
    API_FUNCTION(StoreApi, buildSubscriptionQuery)

    void InboxApi_newInboxApi(int taskId, int connectionPtr, int threadApiPtr, int storeApiPtr) {
        ProxyedTaskRunner::getInstance()->runTask(taskId, [&, connectionPtr, threadApiPtr, storeApiPtr]{
            auto connection = (ConnectionVar*)connectionPtr;
            auto threadApi = (ThreadApiVar*)threadApiPtr;
            auto storeApi = (StoreApiVar*)storeApiPtr;
            auto inboxApi = new InboxApiVar(connection->getApi(), threadApi->getApi(), storeApi->getApi(), core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});
            return (int)inboxApi;
        });
    }
    void InboxApi_deleteInboxApi(int taskId, int ptr) {
        ProxyedTaskRunner::getInstance()->runTaskVoid(taskId, [&, ptr]{
            delete (InboxApiVar*)ptr;
        });
    }
    API_FUNCTION(InboxApi, create)
    API_FUNCTION(InboxApi, createInbox)
    API_FUNCTION(InboxApi, updateInbox)
    API_FUNCTION(InboxApi, getInbox)
    API_FUNCTION(InboxApi, listInboxes)
    API_FUNCTION(InboxApi, getInboxPublicView)
    API_FUNCTION(InboxApi, deleteInbox)
    API_FUNCTION(InboxApi, prepareEntry)
    API_FUNCTION(InboxApi, sendEntry)
    API_FUNCTION(InboxApi, readEntry)
    API_FUNCTION(InboxApi, listEntries)
    API_FUNCTION(InboxApi, deleteEntry)
    API_FUNCTION(InboxApi, createFileHandle)
    API_FUNCTION(InboxApi, writeToFile)
    API_FUNCTION(InboxApi, openFile)
    API_FUNCTION(InboxApi, readFromFile)
    API_FUNCTION(InboxApi, seekInFile)
    API_FUNCTION(InboxApi, closeFile)
    API_FUNCTION(InboxApi, subscribeFor)
    API_FUNCTION(InboxApi, unsubscribeFrom)
    API_FUNCTION(InboxApi, buildSubscriptionQuery)

    void KvdbApi_newKvdbApi(int taskId, int connectionPtr) {
        ProxyedTaskRunner::getInstance()->runTask(taskId, [&, connectionPtr]{
            auto connection = (ConnectionVar*)connectionPtr;
            auto kvdbApi = new KvdbApiVar(connection->getApi(), core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});
            return (int)kvdbApi;
        });
    }
    void KvdbApi_deleteKvdbApi(int taskId, int ptr) {
        ProxyedTaskRunner::getInstance()->runTaskVoid(taskId, [&, ptr]{
            delete (KvdbApiVar*)ptr;
        });
    }
    API_FUNCTION(KvdbApi, create)
    API_FUNCTION(KvdbApi, createKvdb)
    API_FUNCTION(KvdbApi, updateKvdb)
    API_FUNCTION(KvdbApi, deleteKvdb)
    API_FUNCTION(KvdbApi, getKvdb)
    API_FUNCTION(KvdbApi, listKvdbs)
    API_FUNCTION(KvdbApi, getEntry)
    API_FUNCTION(KvdbApi, hasEntry)
    API_FUNCTION(KvdbApi, listEntriesKeys)
    API_FUNCTION(KvdbApi, listEntries)
    API_FUNCTION(KvdbApi, setEntry)
    API_FUNCTION(KvdbApi, deleteEntry)
    API_FUNCTION(KvdbApi, deleteEntries)
    API_FUNCTION(KvdbApi, subscribeFor)
    API_FUNCTION(KvdbApi, unsubscribeFrom)
    API_FUNCTION(KvdbApi, buildSubscriptionQuery)
    API_FUNCTION(KvdbApi, buildSubscriptionQueryForSelectedEntry)

    void CryptoApi_newCryptoApi(int taskId) {
        ProxyedTaskRunner::getInstance()->runTask(taskId, [&]{
            auto service = new CryptoApiVar(core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});
            return (int)service;
        });
    }
    void CryptoApi_deleteCryptoApi(int taskId, int ptr) {
        ProxyedTaskRunner::getInstance()->runTaskVoid(taskId, [&, ptr]{
            delete (CryptoApiVar*)ptr;
        });
    }
    API_FUNCTION(CryptoApi, create)
    API_FUNCTION(CryptoApi, signData)
    API_FUNCTION(CryptoApi, verifySignature)
    API_FUNCTION(CryptoApi, generatePrivateKey)
    API_FUNCTION(CryptoApi, derivePrivateKey)
    API_FUNCTION(CryptoApi, derivePrivateKey2)
    API_FUNCTION(CryptoApi, derivePublicKey)
    API_FUNCTION(CryptoApi, generateKeySymmetric)
    API_FUNCTION(CryptoApi, encryptDataSymmetric)
    API_FUNCTION(CryptoApi, decryptDataSymmetric)
    API_FUNCTION(CryptoApi, convertPEMKeytoWIFKey)
    API_FUNCTION(CryptoApi, generateBip39)
    API_FUNCTION(CryptoApi, fromMnemonic)
    API_FUNCTION(CryptoApi, fromEntropy)
    API_FUNCTION(CryptoApi, entropyToMnemonic)
    API_FUNCTION(CryptoApi, mnemonicToEntropy)
    API_FUNCTION(CryptoApi, mnemonicToSeed)

    void ExtKey_deleteExtKey(int taskId, int ptr) {
        ProxyedTaskRunner::getInstance()->runTaskVoid(taskId, [&, ptr]{
            delete (ExtKeyVar*)ptr;
        });
    }

    void ExtKey_fromSeed(int taskId, emscripten::val args) {
        Poco::Dynamic::Var argsVar = Mapper::map(args);
        ProxyedTaskRunner::getInstance()->runTask(taskId,[&, argsVar] {
            auto service = new ExtKeyVar(core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});
            return service->fromSeed(argsVar);
        });    
    }

    void ExtKey_fromBase58(int taskId, emscripten::val args) {
        Poco::Dynamic::Var argsVar = Mapper::map(args);
        ProxyedTaskRunner::getInstance()->runTask(taskId,[&, argsVar] {
            auto service = new ExtKeyVar(core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});
            return service->fromBase58(argsVar);
        });   
    }

    void ExtKey_generateRandom(int taskId, emscripten::val args) {
        Poco::Dynamic::Var argsVar = Mapper::map(args);
        ProxyedTaskRunner::getInstance()->runTask(taskId,[&, argsVar] {
            auto service = new ExtKeyVar(core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});
            return service->generateRandom(argsVar);
        });   
    }

    API_FUNCTION(ExtKey, derive)
    API_FUNCTION(ExtKey, deriveHardened)
    API_FUNCTION(ExtKey, getPrivatePartAsBase58)
    API_FUNCTION(ExtKey, getPublicPartAsBase58)
    API_FUNCTION(ExtKey, getPrivateKey)
    API_FUNCTION(ExtKey, getPublicKey)
    API_FUNCTION(ExtKey, getPrivateEncKey)
    API_FUNCTION(ExtKey, getPublicKeyAsBase58Address)
    API_FUNCTION(ExtKey, getChainCode)
    API_FUNCTION(ExtKey, verifyCompactSignatureWithHash)
    API_FUNCTION(ExtKey, isPrivate)


    void EventApi_newEventApi(int taskId, int connectionPtr) {
        ProxyedTaskRunner::getInstance()->runTask(taskId, [&, connectionPtr]{
            auto connection = (ConnectionVar*)connectionPtr;
            auto api = new EventApiVar(connection->getApi(), core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});
            return (int)api;
        });
    }
    void EventApi_deleteEventApi(int taskId, int ptr) {
        ProxyedTaskRunner::getInstance()->runTaskVoid(taskId, [&, ptr]{
            delete (EventApiVar*)ptr;
        });
    }
    API_FUNCTION(EventApi, create)
    API_FUNCTION(EventApi, emitEvent)
    API_FUNCTION(EventApi, subscribeFor)
    API_FUNCTION(EventApi, unsubscribeFrom)
    API_FUNCTION(EventApi, buildSubscriptionQuery)


} // namespace api
} // namespace webendpoint
} // namespace privmx
