/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#include "Endpoint.hpp"

#include <privmx/endpoint/core/varinterface/EventQueueVarInterface.hpp>
#include <privmx/endpoint/core/varinterface/ConnectionVarInterface.hpp>
#include <privmx/endpoint/thread/varinterface/ThreadApiVarInterface.hpp>
#include <privmx/endpoint/store/varinterface/StoreApiVarInterface.hpp>
#include <privmx/endpoint/inbox/varinterface/InboxApiVarInterface.hpp>
#include <privmx/endpoint/crypto/varinterface/CryptoApiVarInterface.hpp>

#include "Macros.hpp"
#include "Mapper.hpp"
#include "ProxyedTaskRunner.hpp"

using namespace privmx::endpoint;
using namespace privmx::webendpoint;
using namespace privmx::webendpoint::api;

using EventQueueVar = privmx::endpoint::core::EventQueueVarInterface;
using ConnectionVar = privmx::endpoint::core::ConnectionVarInterface;
using ThreadApiVar = privmx::endpoint::thread::ThreadApiVarInterface;
using StoreApiVar = privmx::endpoint::store::StoreApiVarInterface;
using InboxApiVar = privmx::endpoint::inbox::InboxApiVarInterface;
using CryptoApiVar = privmx::endpoint::crypto::CryptoApiVarInterface;

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
    API_FUNCTION(Connection, disconnect)

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
    API_FUNCTION(ThreadApi, subscribeForThreadEvents)
    API_FUNCTION(ThreadApi, unsubscribeFromThreadEvents)
    API_FUNCTION(ThreadApi, subscribeForMessageEvents)
    API_FUNCTION(ThreadApi, unsubscribeFromMessageEvents)

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
    API_FUNCTION(StoreApi, subscribeForStoreEvents)
    API_FUNCTION(StoreApi, unsubscribeFromStoreEvents)
    API_FUNCTION(StoreApi, subscribeForFileEvents)
    API_FUNCTION(StoreApi, unsubscribeFromFileEvents)

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
    API_FUNCTION(InboxApi, subscribeForInboxEvents)
    API_FUNCTION(InboxApi, unsubscribeFromInboxEvents)
    API_FUNCTION(InboxApi, subscribeForEntryEvents)
    API_FUNCTION(InboxApi, unsubscribeFromEntryEvents)

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
    API_FUNCTION(CryptoApi, generatePrivateKey)
    API_FUNCTION(CryptoApi, derivePrivateKey)
    API_FUNCTION(CryptoApi, derivePublicKey)
    API_FUNCTION(CryptoApi, generateKeySymmetric)
    API_FUNCTION(CryptoApi, encryptDataSymmetric)
    API_FUNCTION(CryptoApi, decryptDataSymmetric)
    API_FUNCTION(CryptoApi, convertPEMKeytoWIFKey)

} // namespace api
} // namespace webendpoint
} // namespace privmx
