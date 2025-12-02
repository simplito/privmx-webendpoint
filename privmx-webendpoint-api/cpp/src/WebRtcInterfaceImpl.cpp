#include "WebRtcInterfaceImpl.hpp"
#include <emscripten.h>
#include <emscripten/val.h>
#include <emscripten/bind.h>
#include <emscripten/threading.h>
#include <emscripten/proxying.h>
#include "privmx/endpoint/stream/Types.hpp"
#include "privmx/endpoint/stream/StreamVarSerializer.hpp"
#include "privmx/utils/Utils.hpp"
#include "./RemoteExecutor.hpp"

// Include Poco Headers for extraction
#include <Poco/Dynamic/Var.h>
#include <Poco/JSON/Object.h>

using namespace privmx::webendpoint::stream;
using namespace privmx::endpoint::stream;
using namespace privmx::endpoint;
using namespace emscripten;
using SdpWithTypeModel = privmx::endpoint::stream::SdpWithTypeModel;
using SdpWithRoomModel = privmx::endpoint::stream::SdpWithRoomModel;
using UpdateSessionIdModel = privmx::endpoint::stream::UpdateSessionIdModel;
using RoomModel = privmx::endpoint::stream::RoomModel;

EM_JS(emscripten::EM_VAL, print_error_webrtc, (const char* msg), {
    console.error(UTF8ToString(msg));
});

EM_JS(emscripten::EM_VAL, webRtcJsHandler, (emscripten::EM_VAL name_handle, emscripten::EM_VAL val_handle, emscripten::EM_VAL val_bindId, int promise_id), {
    let name = Emval.toValue(name_handle);
    let params = Emval.toValue(val_handle);
    let bindId = Emval.toValue(val_bindId);
    
    // Call the actual JS implementation
    // Note: Ensure window.webRtcInterfaceToNativeHandler exists and returns a Promise or Value
    let callResult;
    try {
        callResult = window.webRtcInterfaceToNativeHandler[bindId].methodCall(name, params);
    } catch(e) {
        let ret = { status: -1, buff: "", error: e.toString()};
        Module.ccall('RemoteExecutor_onError', null, ['number', 'number'], [promise_id, Emval.toHandle(ret)]);
        return;
    }

    // Handle both async (Promise) and sync returns
    Promise.resolve(callResult)
        .then(response => {
            let ret = {status: 1, buff: response, error: ""};
            Module.ccall('RemoteExecutor_onSuccess', null, ['number', 'number'], [promise_id, Emval.toHandle(ret)]);
        })
        .catch(error => {
            console.error("Error on webRtcJsHandler", name, error);
            let ret = { status: -1, buff: "", error: error.toString()};
            Module.ccall('RemoteExecutor_onError', null, ['number', 'number'], [promise_id, Emval.toHandle(ret)]);
        });
});

WebRtcInterfaceImpl::WebRtcInterfaceImpl(int interfaceBindId): _interfaceBindId(interfaceBindId) {
    // printErrorInJS("created WebRtcInterfaceImpl(wersion for web) with bindId: " + std::to_string(_interfaceBindId));
}

void WebRtcInterfaceImpl::printErrorInJS(const std::string& msg) {
    print_error_webrtc(msg.c_str());
}

emscripten::val WebRtcInterfaceImpl::callWebRtcJSHandler(emscripten::EM_VAL name, emscripten::EM_VAL params, int promise_id) {
    emscripten::val bindId = emscripten::val(_interfaceBindId);
    // This returns undefined usually, as the result comes back via RemoteExecutor
    return emscripten::val::take_ownership(webRtcJsHandler(name, params, bindId.as_handle(), promise_id));
}

void WebRtcInterfaceImpl::runTaskAsync(const std::function<void(void)>& func){
    pthread_t mainThread = emscripten_main_runtime_thread_id();
    emscripten::ProxyingQueue _queue;
    _queue.proxyAsync(mainThread, [&,func]{
        func();
    });
}

template<typename T>
emscripten::val WebRtcInterfaceImpl::mapToVal(const T& value) {
    core::VarSerializer serializer {core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING}};
    Poco::Dynamic::Var serialized {serializer.serialize(value)};
    pson_value* res = (pson_value*)&serialized;
    auto out {Mapper::map(res)};
    return out;
}

std::shared_ptr<WebRtcInterfaceImpl> WebRtcInterfaceHolder::getInstance(int interfaceBindId) {
    if (!_webRtcInterface) {
        _webRtcInterface = std::make_shared<WebRtcInterfaceImpl>(interfaceBindId);
    }
    return _webRtcInterface;
}

WebRtcInterfaceImpl* WebRtcInterfaceHolder::getRawPtr() { return _webRtcInterface.get(); }

void WebRtcInterfaceImpl::assertStatus(const std::string& method, const emscripten::val& jsResult) {
    int status = jsResult["status"].as<int>();
    if (status < 0) {
        printErrorInJS("[WebRtcInterfaceImpl." + method + "()] Error. Status: " + std::to_string(status));
        throw std::runtime_error("[WebRtcInterfaceImpl." + method + "()] Error");
    }
}

// --- IMPLEMENTATIONS ---

std::string WebRtcInterfaceImpl::createOfferAndSetLocalDescription(const std::string& streamRoomId) {
    // 1. Execute on Main Thread via RemoteExecutor
    std::future<Poco::Dynamic::Var> ftr = RemoteExecutor::getInstance().execute([&](int id) {
        runTaskAsync([&, streamRoomId, id]{
            auto methodName {"createOfferAndSetLocalDescription"};
            emscripten::val name = emscripten::val::u8string(methodName);
            RoomModel paramsModel = {.roomId = streamRoomId};
            emscripten::val params = mapToVal(paramsModel);
            callWebRtcJSHandler(name.as_handle(), params.as_handle(), id);
        });
    });
    Poco::Dynamic::Var result = ftr.get();
    Poco::JSON::Object::Ptr obj = result.extract<Poco::JSON::Object::Ptr>();
    return obj->getValue<std::string>("buff");
}

std::string WebRtcInterfaceImpl::createAnswerAndSetDescriptions(const std::string& streamRoomId, const std::string& sdp, const std::string& type) {
    std::future<Poco::Dynamic::Var> ftr = RemoteExecutor::getInstance().execute([&](int id) {
        runTaskAsync([&, sdp, type, streamRoomId, id]{
            auto methodName {"createAnswerAndSetDescriptions"};
            emscripten::val name = emscripten::val::u8string(methodName);
            SdpWithRoomModel paramsModel = {.roomId = streamRoomId, .sdp = sdp, .type = type};
            emscripten::val params = mapToVal(paramsModel);
            callWebRtcJSHandler(name.as_handle(), params.as_handle(), id);
        });
    });

    Poco::Dynamic::Var result = ftr.get();
    Poco::JSON::Object::Ptr obj = result.extract<Poco::JSON::Object::Ptr>();
    return obj->getValue<std::string>("buff");
}

void WebRtcInterfaceImpl::setAnswerAndSetRemoteDescription(const std::string& streamRoomId, const std::string& sdp, const std::string& type) {
    std::future<Poco::Dynamic::Var> ftr = RemoteExecutor::getInstance().execute([&](int id) {
        runTaskAsync([&, sdp, type, streamRoomId, id]{
            auto methodName {"setAnswerAndSetRemoteDescription"};
            emscripten::val name = emscripten::val::u8string(methodName);
            SdpWithRoomModel paramsModel = {.roomId = streamRoomId, .sdp = sdp, .type = type};
            emscripten::val params = mapToVal(paramsModel);
            callWebRtcJSHandler(name.as_handle(), params.as_handle(), id);
        });
    });
    ftr.get(); 
}

void WebRtcInterfaceImpl::updateSessionId(const std::string& streamRoomId, const int64_t sessionId, const std::string& connectionType) {
    std::future<Poco::Dynamic::Var> ftr = RemoteExecutor::getInstance().execute([&](int id) {
        runTaskAsync([&, sessionId, connectionType, streamRoomId, id]{
            auto methodName {"updateSessionId"};
            emscripten::val name = emscripten::val::u8string(methodName);
            UpdateSessionIdModel paramsModel = {.streamRoomId = streamRoomId, .connectionType = connectionType, .sessionId = sessionId};
            emscripten::val params = mapToVal(paramsModel);
            callWebRtcJSHandler(name.as_handle(), params.as_handle(), id);
        });
    });

    ftr.get();
}

void WebRtcInterfaceImpl::close(const std::string& streamRoomId) {
    std::future<Poco::Dynamic::Var> ftr = RemoteExecutor::getInstance().execute([&](int id) {
        runTaskAsync([&, streamRoomId, id]{
            auto methodName {"close"};
            emscripten::val name = emscripten::val::u8string(methodName);
            RoomModel paramsModel = {.roomId = streamRoomId};
            emscripten::val params = mapToVal(paramsModel);
            callWebRtcJSHandler(name.as_handle(), params.as_handle(), id);
        });
    });
    ftr.get();
}

void WebRtcInterfaceImpl::updateKeys(const std::string& streamRoomId, const std::vector<privmx::endpoint::stream::Key>& keys) {
    std::future<Poco::Dynamic::Var> ftr = RemoteExecutor::getInstance().execute([&](int id) {
        runTaskAsync([&, keys, streamRoomId, id]{
            auto methodName {"updateKeys"};
            emscripten::val name = emscripten::val::u8string(methodName);
            
            // Manual mapping logic preserved from your comment
            emscripten::val streamRoomIdVal = emscripten::val::u8string(streamRoomId.c_str());
            emscripten::val keysArrayVal = emscripten::val::array();
            for (auto key: keys) {
                emscripten::val keyObj = emscripten::val::object();
                keyObj.set("keyId", mapToVal(key.keyId));

                emscripten::val view{emscripten::typed_memory_view(key.key.size(), key.key.data())};
                auto keyView = emscripten::val::global("Uint8Array").new_(key.key.size());
                keyView.call<void>("set", view);
                keyObj.set("key", keyView);
                keyObj.set("type", mapToVal(key.type));    
                keysArrayVal.call<emscripten::val>("push", keyObj);
            }

            emscripten::val params = val::object();
            params.set("streamRoomId", streamRoomIdVal);
            params.set("keys", keysArrayVal);
            
            callWebRtcJSHandler(name.as_handle(), params.as_handle(), id);
        });
    });
    
    ftr.get();
}