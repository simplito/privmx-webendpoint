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
#include <privmx/endpoint/crypto/varinterface/CryptoApiVarInterface.hpp>
#include <privmx/endpoint/event/varinterface/EventApiVarInterface.hpp>
#include "privmx/endpoint/core/VarDeserializer.hpp"
#include "privmx/endpoint/core/VarSerializer.hpp"
#include <privmx/endpoint/core/UserVerifierInterface.hpp>

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
    API_FUNCTION(Connection, getContextUsers)
    API_FUNCTION(Connection, disconnect)

    EM_JS(emscripten::EM_VAL, print_error_main, (const char* msg), {
        console.error(UTF8ToString(msg));
    });
    void printErrorInJS(const std::string& msg) {
        print_error_main(msg.c_str());
    }

    EM_ASYNC_JS(emscripten::EM_VAL, verifier_caller, (emscripten::EM_VAL name_handle, emscripten::EM_VAL val_handle), {
        let name = Emval.toValue(name_handle);
        let params = Emval.toValue(val_handle);
        let response = {};

        try {
            response = await userVierifier_verify(params);
        } catch (error) {
            console.error("Error on userVerifier_verify call from C for", params);
            let ret = { status: -1, buff: "", error: error.toString()};
            return Emval.toHandle(ret);
        }
        let ret = {status: 1, buff: response, error: ""};
        return Emval.toHandle(ret);
    });

    emscripten::val callVerifierOnJS(emscripten::val& name, emscripten::val& params) {
        auto ret = emscripten::val::take_ownership(verifier_caller(name.as_handle(), params.as_handle()));
        emscripten_sleep(0);
        return ret;
    }

    class CustomUserVerifierInterface: public virtual UserVerifierInterface {
    public:
        std::vector<bool> verify(const std::vector<VerificationRequest>& request) override {
            printErrorInJS("on verify (cpp)");
            emscripten::val name { emscripten::val::u8string("userVerifier_verify") }; // here we should pass ptr
            emscripten::val params { emscripten::val::object() };

            std::shared_ptr<core::VarSerializer> serializer = std::make_shared<core::VarSerializer>(core::VarSerializer::Options{.addType=true, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING});

            Poco::JSON::Array::Ptr result = Poco::JSON::Array::Ptr(new Poco::JSON::Array());
            int size = request.size();
            for (int i = 0; i < size; ++i) {
                auto serialized = serializer->serialize(request[i]);
                result->set(i, serialized);
            }
            emscripten::val valResult = Mapper::map((pson_value*)&result);
            params.set("request", valResult); 
            
            emscripten::val jsResult = callVerifierOnJS(name, params);

            int status = jsResult["status"].as<int>();
            if (status < 0) {
                printErrorInJS("Error: on verify");
                throw std::runtime_error("Error: on verify");
            }

            std::vector<bool> out { jsResult["buff"].as<std::vector<bool>>() };
            return out;
        };
    };

    class UserVerifierHolder {
        public:
            std::shared_ptr<CustomUserVerifierInterface> getInstance() {
                if (!_verifierInterface) {
                    _verifierInterface = std::make_shared<CustomUserVerifierInterface>();
                }
                printErrorInJS("==> get verifier instance");
                return _verifierInterface;
            }

        private:
            std::shared_ptr<CustomUserVerifierInterface> _verifierInterface;
    };

    void Connection_newUserVerifierInterface(int taskId, int connectionPtr) {
        ProxyedTaskRunner::getInstance()->runTask(taskId, [&, connectionPtr]{
            auto connection = (ConnectionVar*)connectionPtr;
            // auto customInterfaceRawPtr = new CustomUserVerifierInterface();
            // std::shared_ptr<CustomUserVerifierInterface> customVerifier(customInterfaceRawPtr);
            auto customInterfaceRawPtr = new UserVerifierHolder();
            connection->getApi().setUserVerifier(customInterfaceRawPtr->getInstance());
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
    API_FUNCTION(EventApi, subscribeForCustomEvents)
    API_FUNCTION(EventApi, unsubscribeFromCustomEvents)


} // namespace api
} // namespace webendpoint
} // namespace privmx
