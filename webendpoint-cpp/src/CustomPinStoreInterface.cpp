#include "CustomPinStoreInterface.hpp"

#include <Poco/JSON/Object.h>
#include <emscripten.h>
#include <emscripten/val.h>

#include <privmx/utils/Utils.hpp>
#include <stdexcept>

#include "AsyncEngine.hpp"

using namespace privmx::webendpoint;
using namespace privmx::endpoint;

// clang-format off

EM_JS(void, pin_store_caller, (emscripten::EM_VAL method_handle, emscripten::EM_VAL args_handle, int bindId, int promise_id), {
    const method = Emval.toValue(method_handle);
    const args = Emval.toValue(args_handle);
    Promise.resolve()
        .then(() => window.pinStoreBinder[bindId][method](...args))
        .then(response => {
            Module.ccall('AsyncEngine_onSuccess', null, ['number', 'number'],
                [promise_id, Emval.toHandle({status: 1, buff: response, error: ""})]);
        })
        .catch(error => {
            console.error("Error on pin store", method, "call from C", error);
            Module.ccall('AsyncEngine_onError', null, ['number', 'number'],
                [promise_id, Emval.toHandle({status: -1, buff: "", error: String(error)})]);
        });
});

// clang-format on

Poco::Dynamic::Var CustomPinStoreInterface::call(const std::string& method, const std::vector<std::string>& args) {
    const int bindId = _bindId;
    auto ftr = AsyncEngine::getInstance()->callJsAsync(
        [&](int id) {
            emscripten::val jsArgs = emscripten::val::array();
            for (const auto& arg : args) {
                jsArgs.call<void>("push", emscripten::val::u8string(arg.c_str()));
            }
            pin_store_caller(emscripten::val::u8string(method.c_str()).as_handle(), jsArgs.as_handle(), bindId, id);
        },
        ThreadTarget::Main);
    const auto result = ftr.get().extract<Poco::JSON::Object::Ptr>();
    if (result->getValue<int>("status") < 0) {
        throw std::runtime_error("pin store: " + result->optValue<std::string>("error", "unknown error"));
    }
    return result->get("buff");
}

core::Buffer CustomPinStoreInterface::load(const std::string& key) {
    return core::Buffer::from(privmx::utils::Base64::toString(call("load", {key}).convert<std::string>()));
}

bool CustomPinStoreInterface::save(const std::string& key, const core::Buffer& blob, const core::Buffer& expected) {
    return call("save",
                {key, privmx::utils::Base64::from(blob.stdString()), privmx::utils::Base64::from(expected.stdString())})
        .convert<bool>();
}
