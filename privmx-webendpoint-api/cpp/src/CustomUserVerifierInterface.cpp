#include <emscripten/threading.h>
#include <emscripten/proxying.h>
#include "CustomUserVerifierInterface.hpp"
#include "privmx/endpoint/core/VarDeserializer.hpp"
#include "privmx/endpoint/core/VarSerializer.hpp"

#include "AsyncEngine.hpp"
#include "Mapper.hpp"
#include <Poco/JSON/Object.h>
#include <Poco/JSON/Array.h>

using namespace privmx::webendpoint;
using namespace privmx::endpoint;

EM_JS(emscripten::EM_VAL, print_error_main, (const char* msg), {
    console.error(UTF8ToString(msg));
});


EM_JS(void, verifier_caller, (emscripten::EM_VAL name_handle, emscripten::EM_VAL val_handle, emscripten::EM_VAL val_bindId, int promise_id), {
    let name = Emval.toValue(name_handle);
    let params = Emval.toValue(val_handle);
    let bindId = Emval.toValue(val_bindId);

    window.userVerifierBinder[bindId].userVierifier_verify(params)
        .then(response => {
            let ret = {status: 1, buff: response, error: ""};
            Module.ccall(
                'AsyncEngine_onSuccess', 
                null, 
                ['number', 'number'], 
                [promise_id, Emval.toHandle(ret)]
            );
        })
        .catch(error => {
            console.error("Error on userVerifier_verify call from C for", params, error);
            let ret = { status: -1, buff: "", error: error.toString()};
            Module.ccall(
                'AsyncEngine_onError', 
                null, 
                ['number', 'number'], 
                [promise_id, Emval.toHandle(ret)]
            );
        });
});


void CustomUserVerifierInterface::printErrorInJS(const std::string& msg) {
    print_error_main(msg.c_str());
}

Poco::Dynamic::Var CustomUserVerifierInterface::callVerifierOnJS(const std::string& methodName, const Poco::Dynamic::Var& params) {
    int bindIdVal = _interfaceBindId; 
    
    auto ftr = AsyncEngine::getInstance()->callJsAsync([&](int id) {
        emscripten::val jsName = emscripten::val::u8string(methodName.c_str());
        emscripten::val jsBindId = emscripten::val(bindIdVal);
        Poco::Dynamic::Var localParams = params; 
        emscripten::val jsParams = Mapper::map((pson_value*)&localParams);
        verifier_caller(jsName.as_handle(), jsParams.as_handle(), jsBindId.as_handle(), id);
    }, ThreadTarget::Worker);
    return ftr.get();
}

std::vector<bool> CustomUserVerifierInterface::verify(const std::vector<core::VerificationRequest>& request) {
    core::VarSerializer serializer {
        core::VarSerializer::Options{
            .addType=false, 
            .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING
        }
    };
    Poco::Dynamic::Var serializedRequest = serializer.serialize(request);
    Poco::Dynamic::Var resultVar = callVerifierOnJS("userVerifier_verify", serializedRequest);
    Poco::JSON::Object::Ptr obj;
    try {
        obj = resultVar.extract<Poco::JSON::Object::Ptr>();
    } catch (...) {
        throw std::runtime_error("Invalid result format from JS verifier");
    }

    int status = obj->getValue<int>("status");
    if (status < 0) {
        std::string error = obj->optValue<std::string>("error", "Unknown Error");
        printErrorInJS("[CustomUserVerifierInterface] Error: " + error);
        throw std::runtime_error(error);
    }

    std::vector<bool> finalResult;
    Poco::Dynamic::Var buffVar = obj->get("buff");
    
    if (buffVar.isArray()) {
        Poco::JSON::Array::Ptr arr = buffVar.extract<Poco::JSON::Array::Ptr>();
        for(size_t i = 0; i < arr->size(); ++i) {
            finalResult.push_back(arr->getElement<bool>(i));
        }
    } else {
        throw std::runtime_error("JS verifier returned invalid buffer type");
    }

    return finalResult;
}

UserVerifierHolder::UserVerifierHolder(int bindId): _bindId(bindId) {}

std::shared_ptr<CustomUserVerifierInterface> UserVerifierHolder::getInstance() {
    if (!_verifierInterface) {
        _verifierInterface = std::make_shared<CustomUserVerifierInterface>(_bindId);
    }
    return _verifierInterface;
}