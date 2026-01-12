#include "WebRtcInterfaceImpl.hpp"

#include <Poco/Dynamic/Var.h>
#include <Poco/JSON/Object.h>
#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/proxying.h>
#include <emscripten/threading.h>
#include <emscripten/val.h>

#include "AsyncEngine.hpp"
#include "privmx/endpoint/stream/StreamVarSerializer.hpp"
#include "privmx/endpoint/stream/Types.hpp"
#include "privmx/utils/Utils.hpp"

using namespace privmx::webendpoint::stream;
using namespace privmx::endpoint::stream;
using namespace privmx::endpoint;
using namespace emscripten;
using SdpWithTypeModel = privmx::endpoint::stream::SdpWithTypeModel;
using SdpWithRoomModel = privmx::endpoint::stream::SdpWithRoomModel;
using UpdateSessionIdModel = privmx::endpoint::stream::UpdateSessionIdModel;
using RoomModel = privmx::endpoint::stream::RoomModel;

// clang-format off

// Helper to print errors to JS console
EM_JS(emscripten::EM_VAL, print_error_webrtc, (const char* msg), {
    console.error(UTF8ToString(msg));
});

// JS Handler: Calls the global window object methods
EM_JS(emscripten::EM_VAL, webRtcJsHandler, (emscripten::EM_VAL name_handle, emscripten::EM_VAL val_handle, emscripten::EM_VAL val_bindId, int promise_id), {
    let name = Emval.toValue(name_handle);
    let params = Emval.toValue(val_handle);
    let bindId = Emval.toValue(val_bindId);
    
    let callResult;
    try {
        if (!window.webRtcInterfaceToNativeHandler || !window.webRtcInterfaceToNativeHandler[bindId]) {
            throw new Error("WebRtcInterface handler not found for bindId: " + bindId);
        }
        callResult = window.webRtcInterfaceToNativeHandler[bindId].methodCall(name, params);
    } catch(e) {
        console.error("WebRTC JS Error:", e);
        let ret = { status: -1, buff: "", error: e.toString()};
        Module.ccall('AsyncEngine_onError', null, ['number', 'number'], [promise_id, Emval.toHandle(ret)]);
        return;
    }

    Promise.resolve(callResult)
        .then(response => {
            let ret = {status: 1, buff: response, error: ""};
            Module.ccall('AsyncEngine_onSuccess', null, ['number', 'number'], [promise_id, Emval.toHandle(ret)]);
        })
        .catch(error => {
            console.error("Error on webRtcJsHandler promise:", name, error);
            let ret = { status: -1, buff: "", error: error.toString()};
            Module.ccall('AsyncEngine_onError', null, ['number', 'number'], [promise_id, Emval.toHandle(ret)]);
        });
});

// clang-format on

WebRtcInterfaceImpl::WebRtcInterfaceImpl(int interfaceBindId) : _interfaceBindId(interfaceBindId) {}

void WebRtcInterfaceImpl::printErrorInJS(const std::string& msg) {
    print_error_webrtc(msg.c_str());
}

template<typename T>
emscripten::val WebRtcInterfaceImpl::mapToVal(const T& value) {
    core::VarSerializer serializer{core::VarSerializer::Options{
        .addType = false, .binaryFormat = core::VarSerializer::Options::PSON_BINARYSTRING}};
    Poco::Dynamic::Var serialized{serializer.serialize(value)};
    pson_value* res = (pson_value*)&serialized;
    return Mapper::map(res);
}

std::shared_ptr<WebRtcInterfaceImpl> WebRtcInterfaceHolder::getInstance(int interfaceBindId) {
    if (!_webRtcInterface) {
        _webRtcInterface = std::make_shared<WebRtcInterfaceImpl>(interfaceBindId);
    }
    return _webRtcInterface;
}

WebRtcInterfaceImpl* WebRtcInterfaceHolder::getRawPtr() {
    return _webRtcInterface.get();
}

void WebRtcInterfaceImpl::assertStatus(const std::string& method, const emscripten::val& jsResult) {
    int status = jsResult["status"].as<int>();
    if (status < 0) {
        std::string err = "Unknown Error";
        if (jsResult.hasOwnProperty("error")) {
            err = jsResult["error"].as<std::string>();
        }
        printErrorInJS("[WebRtcInterfaceImpl." + method + "()] Error: " + err);
        throw std::runtime_error("[WebRtcInterfaceImpl." + method + "()] " + err);
    }
}

std::string WebRtcInterfaceImpl::createOfferAndSetLocalDescription(const std::string& streamRoomId) {
    auto future = AsyncEngine::getInstance()->callJsAsync(
        [=, bindId = _interfaceBindId](int id) {
            auto methodName{"createOfferAndSetLocalDescription"};
            emscripten::val name = emscripten::val::u8string(methodName);

            RoomModel paramsModel = {.roomId = streamRoomId};
            emscripten::val params = WebRtcInterfaceImpl::mapToVal(paramsModel);

            webRtcJsHandler(name.as_handle(), params.as_handle(), emscripten::val(bindId).as_handle(), id);
        },
        ThreadTarget::Main);

    Poco::Dynamic::Var result = future.get();
    Poco::JSON::Object::Ptr obj = result.extract<Poco::JSON::Object::Ptr>();
    if (obj->getValue<int>("status") < 0) throw std::runtime_error(obj->getValue<std::string>("error"));
    return obj->getValue<std::string>("buff");
}

std::string WebRtcInterfaceImpl::createAnswerAndSetDescriptions(const std::string& streamRoomId, const std::string& sdp,
                                                                const std::string& type) {
    auto future = AsyncEngine::getInstance()->callJsAsync(
        [=, bindId = _interfaceBindId](int id) {
            auto methodName{"createAnswerAndSetDescriptions"};
            emscripten::val name = emscripten::val::u8string(methodName);

            SdpWithRoomModel paramsModel = {.roomId = streamRoomId, .sdp = sdp, .type = type};
            emscripten::val params = WebRtcInterfaceImpl::mapToVal(paramsModel);

            webRtcJsHandler(name.as_handle(), params.as_handle(), emscripten::val(bindId).as_handle(), id);
        },
        ThreadTarget::Main);

    Poco::Dynamic::Var result = future.get();
    Poco::JSON::Object::Ptr obj = result.extract<Poco::JSON::Object::Ptr>();

    if (obj->getValue<int>("status") < 0) throw std::runtime_error(obj->getValue<std::string>("error"));

    return obj->getValue<std::string>("buff");
}

void WebRtcInterfaceImpl::setAnswerAndSetRemoteDescription(const std::string& streamRoomId, const std::string& sdp,
                                                           const std::string& type) {
    auto future = AsyncEngine::getInstance()->callJsAsync(
        [=, bindId = _interfaceBindId](int id) {
            auto methodName{"setAnswerAndSetRemoteDescription"};
            emscripten::val name = emscripten::val::u8string(methodName);

            SdpWithRoomModel paramsModel = {.roomId = streamRoomId, .sdp = sdp, .type = type};
            emscripten::val params = WebRtcInterfaceImpl::mapToVal(paramsModel);

            webRtcJsHandler(name.as_handle(), params.as_handle(), emscripten::val(bindId).as_handle(), id);
        },
        ThreadTarget::Main);

    Poco::Dynamic::Var result = future.get();
    Poco::JSON::Object::Ptr obj = result.extract<Poco::JSON::Object::Ptr>();
    if (obj->getValue<int>("status") < 0) throw std::runtime_error(obj->getValue<std::string>("error"));
}

void WebRtcInterfaceImpl::updateSessionId(const std::string& streamRoomId, const int64_t sessionId,
                                          const std::string& connectionType) {
    auto future = AsyncEngine::getInstance()->callJsAsync(
        [=, bindId = _interfaceBindId](int id) {
            auto methodName{"updateSessionId"};
            emscripten::val name = emscripten::val::u8string(methodName);

            UpdateSessionIdModel paramsModel = {
                .streamRoomId = streamRoomId, .connectionType = connectionType, .sessionId = sessionId};
            emscripten::val params = WebRtcInterfaceImpl::mapToVal(paramsModel);

            webRtcJsHandler(name.as_handle(), params.as_handle(), emscripten::val(bindId).as_handle(), id);
        },
        ThreadTarget::Main);

    Poco::Dynamic::Var result = future.get();
    Poco::JSON::Object::Ptr obj = result.extract<Poco::JSON::Object::Ptr>();
    if (obj->getValue<int>("status") < 0) throw std::runtime_error(obj->getValue<std::string>("error"));
}

void WebRtcInterfaceImpl::close(const std::string& streamRoomId) {
    auto future = AsyncEngine::getInstance()->callJsAsync(
        [=, bindId = _interfaceBindId](int id) {
            auto methodName{"close"};
            emscripten::val name = emscripten::val::u8string(methodName);

            RoomModel paramsModel = {.roomId = streamRoomId};
            emscripten::val params = WebRtcInterfaceImpl::mapToVal(paramsModel);

            webRtcJsHandler(name.as_handle(), params.as_handle(), emscripten::val(bindId).as_handle(), id);
        },
        ThreadTarget::Main);

    Poco::Dynamic::Var result = future.get();
    Poco::JSON::Object::Ptr obj = result.extract<Poco::JSON::Object::Ptr>();
    if (obj->getValue<int>("status") < 0) throw std::runtime_error(obj->getValue<std::string>("error"));
}

void WebRtcInterfaceImpl::updateKeys(const std::string& streamRoomId,
                                     const std::vector<privmx::endpoint::stream::Key>& keys) {
    auto future = AsyncEngine::getInstance()->callJsAsync(
        [=, keys = keys, bindId = _interfaceBindId](int id) {
            auto methodName{"updateKeys"};
            emscripten::val name = emscripten::val::u8string(methodName);

            emscripten::val streamRoomIdVal = emscripten::val::u8string(streamRoomId.c_str());
            emscripten::val keysArrayVal = emscripten::val::array();

            for (const auto& key : keys) {
                emscripten::val keyObj = emscripten::val::object();
                keyObj.set("keyId", WebRtcInterfaceImpl::mapToVal(key.keyId));  // Use static call style

                emscripten::val view{emscripten::typed_memory_view(key.key.size(), key.key.data())};

                auto keyView = emscripten::val::global("Uint8Array").new_(key.key.size());
                keyView.call<void>("set", view);

                keyObj.set("key", keyView);
                keyObj.set("type", WebRtcInterfaceImpl::mapToVal(key.type));
                keysArrayVal.call<void>("push", keyObj);
            }

            emscripten::val params = emscripten::val::object();
            params.set("streamRoomId", streamRoomIdVal);
            params.set("keys", keysArrayVal);

            webRtcJsHandler(name.as_handle(), params.as_handle(), emscripten::val(bindId).as_handle(), id);
        },
        ThreadTarget::Main);

    Poco::Dynamic::Var result = future.get();
    Poco::JSON::Object::Ptr obj = result.extract<Poco::JSON::Object::Ptr>();
    if (obj->getValue<int>("status") < 0) throw std::runtime_error(obj->getValue<std::string>("error"));
}