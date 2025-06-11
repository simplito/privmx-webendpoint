#include "WebRtcInterfaceImpl.hpp"
#include <emscripten.h>
#include <emscripten/val.h>
#include <emscripten/bind.h>

using namespace privmx::webendpoint::stream;
using namespace emscripten;


EM_JS(emscripten::EM_VAL, print_error_main, (const char* msg), {
    console.error(UTF8ToString(msg));
});

EM_ASYNC_JS(emscripten::EM_VAL, webRtcJsHandler, (emscripten::EM_VAL name_handle, emscripten::EM_VAL val_handle), {
    let name = Emval.toValue(name_handle);
    let params = Emval.toValue(val_handle);
    let response = {};

    try {
        response = await window.webRtcInterfaceToNativeHandler.methodCall(name, params);
    } catch (error) {
        console.error("Error on webRtcInterfaceToNativeHandler call from C for", name, params, error);
        let ret = { status: -1, buff: "", error: error.toString()};
        return Emval.toHandle(ret);
    }
    let ret = {status: 1, buff: response, error: ""};
    return Emval.toHandle(ret);
});


void WebRtcInterfaceImpl::printErrorInJS(const std::string& msg) {
    print_error_main(msg.c_str());
}

emscripten::val WebRtcInterfaceImpl::callWebRtcJSHandler(emscripten::EM_VAL name, emscripten::EM_VAL params) {
    auto ret = emscripten::val::take_ownership(webRtcJsHandler(name, params));
    emscripten_sleep(0);
    return ret;
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

std::shared_ptr<WebRtcInterfaceImpl> WebRtcInterfaceHolder::getInstance() {
    if (!_verifierInterface) {
        _webRtcInterface = std::make_shared<WebRtcInterfaceImpl>();
    }
    return _webRtcInterface;
}

void WebRtcInterfaceImpl::assertStatus(const std::string& method, const emscripten::val& jsResult) {
    int status = jsResult["status"].as<int>();
    if (status < 0) {
        printErrorInJS("[WebRtcInterfaceImpl." + method + "()] Error. Status: " + std::to_string(status));
        throw std::runtime_error("[WebRtcInterfaceImpl." + method + "()] Error");
    }
}

std::string WebRtcInterfaceImpl::createOfferAndSetLocalDescription() {
    std::promise<std::vector<bool>> prms;
    std::future<std::string> ftr = prms.get_future();
    runTaskAsync([&, request]{
        auto methodName {"createOfferAndSetLocalDescription"};
        emscripten::val name = emscripten::val::u8string(methodName);
        emscripten::val params = val::object();
        emscripten::val jsResult = callWebRtcJSHandler(name.as_handle(), params.as_handle());
        assertStatus(methodName, jsReult);
        prms.set_value(jsResult["buff"].as<std::string>());
    });
    return ftr.get();
}

std::string WebRtcInterfaceImpl::createAnswerAndSetDescriptions(const std::string& sdp, const std::string& type) {
    std::promise<std::vector<bool>> prms;
    std::future<std::string> ftr = prms.get_future();
    runTaskAsync([&, request]{
        auto methodName {"createOfferAndSetLocalDescription"};
        emscripten::val name = emscripten::val::u8string(methodName);
        SdpWithTypeModel paramsModel = {.sdp = sdp, .type = type};
        emscripten::val params = mapToVal(paramsModel);
        emscripten::val jsResult = callWebRtcJSHandler(name.as_handle(), params.as_handle());
        assertStatus(methodName, jsReult);
        prms.set_value(jsResult["buff"].as<std::string>());
    });
    return ftr.get();
}

void WebRtcInterfaceImpl::setAnswerAndSetRemoteDescription(const std::string& sdp, const std::string& type) {
    runTaskAsync([&, request]{
        auto methodName {"setAnswerAndSetRemoteDescription"};
        emscripten::val name = emscripten::val::u8string(methodName);
        SdpWithTypeModel paramsModel = {.sdp = sdp, .type = type};
        emscripten::val params = val::object();
        emscripten::val jsResult = callWebRtcJSHandler(name.as_handle(), params.as_handle());
        assertStatus(methodName, jsReult);
    });
}

void WebRtcInterfaceImpl::close() {
    runTaskAsync([&, request]{
        auto methodName {"close"};
        emscripten::val name = emscripten::val::u8string(methodName);
        emscripten::val params = val::object();
        emscripten::val jsResult = callWebRtcJSHandler(name.as_handle(), params.as_handle());
        assertStatus(methodName, jsReult);
    });
}

void WebRtcInterfaceImpl::updateKeys(const std::vector<Key>& keys) {
    runTaskAsync([&, request]{
        auto methodName {"updateKeys"};
        emscripten::val name = emscripten::val::u8string(methodName);
        emscripten::val params = mapToVal(keys);
        emscripten::val jsResult = callWebRtcJSHandler(name.as_handle(), params.as_handle());
        assertStatus(methodName, jsReult);
    });
}
