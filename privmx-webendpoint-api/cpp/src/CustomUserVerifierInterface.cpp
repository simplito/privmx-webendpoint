
#include <emscripten/threading.h>
#include <emscripten/proxying.h>
#include "CustomUserVerifierInterface.hpp"
#include "privmx/endpoint/core/VarDeserializer.hpp"
#include "privmx/endpoint/core/VarSerializer.hpp"

using namespace privmx::webendpoint;
using namespace privmx::endpoint;

EM_JS(emscripten::EM_VAL, print_error_main, (const char* msg), {
    console.error(UTF8ToString(msg));
});

EM_ASYNC_JS(emscripten::EM_VAL, verifier_caller, (emscripten::EM_VAL name_handle, emscripten::EM_VAL val_handle, emscripten::EM_VAL val_bindId), {
    let name = Emval.toValue(name_handle);
    let params = Emval.toValue(val_handle);
    let bindId = Emval.toValue(val_bindId);
    let response = {};

    try {
        response = await window.userVerifierBinder[bindId].userVierifier_verify(params);
    } catch (error) {
        console.error("Error on userVerifier_verify call from C for", params, error);
        let ret = { status: -1, buff: "", error: error.toString()};
        return Emval.toHandle(ret);
    }
    let ret = {status: 1, buff: response, error: ""};
    return Emval.toHandle(ret);
});


void CustomUserVerifierInterface::printErrorInJS(const std::string& msg) {
    print_error_main(msg.c_str());
}

emscripten::val CustomUserVerifierInterface::callVerifierOnJS(emscripten::EM_VAL name, emscripten::EM_VAL params) {
    emscripten::val bindId = emscripten::val(_interfaceBindId);
    auto ret = emscripten::val::take_ownership(verifier_caller(name, params, bindId.as_handle()));
    emscripten_sleep(0);
    return ret;
}

std::vector<bool> CustomUserVerifierInterface::verify(const std::vector<core::VerificationRequest>& request) {
    std::promise<std::vector<bool>> prms;
    std::future<std::vector<bool>> ftr = prms.get_future();
    
    runTaskAsync([&, request]{
        emscripten::val name = emscripten::val::u8string("userVerifier_verify");
        emscripten::val params = mapToVal(request);
        emscripten::val jsResult = callVerifierOnJS(name.as_handle(), params.as_handle());

        int status = jsResult["status"].as<int>();
        if (status < 0) {
            printErrorInJS("[CustomUserVerifierIntercace.verify()] Error: on verify. Status: " + std::to_string(status));
            throw std::runtime_error("Error: on verify");
        }

        std::vector<bool> res {};
        auto responseSize = request.size();
        for (int i = 0; i < responseSize; ++i) {
            res.push_back(jsResult["buff"][i].as<bool>());
        }
        prms.set_value(res);
    });

    std::vector<bool> out {ftr.get()};
    return out;
};

    void CustomUserVerifierInterface::runTaskAsync(const std::function<void(void)>& func){
        pthread_t mainThread = emscripten_main_runtime_thread_id();
        emscripten::ProxyingQueue _queue;
        _queue.proxyAsync(mainThread, [&,func]{
            func();
        });
    }

    emscripten::val CustomUserVerifierInterface::mapToVal(const std::vector<endpoint::core::VerificationRequest>& request) {
        core::VarSerializer serializer {core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING}};
        Poco::Dynamic::Var serializedRequest {serializer.serialize(request)};
        pson_value* res = (pson_value*)&serializedRequest;
        auto out {Mapper::map(res)};
        return out;
    }

    UserVerifierHolder::UserVerifierHolder(int bindId): _bindId(bindId) {}

    std::shared_ptr<CustomUserVerifierInterface> UserVerifierHolder::getInstance() {
        if (!_verifierInterface) {
            _verifierInterface = std::make_shared<CustomUserVerifierInterface>(_bindId);
        }
        return _verifierInterface;
    }
