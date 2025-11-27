#include <emscripten.h>
#include <emscripten/val.h>
#include <emscripten/bind.h>
#include "AsyncEngine.hpp"
#include "Mapper.hpp"

using namespace emscripten;
using namespace privmx::webendpoint;

EM_JS(void, performBindingsCall_impl, (const char* method_str, emscripten::EM_VAL params_handle, int callId), {
    let method = UTF8ToString(method_str);
    let params = Emval.toValue(params_handle);
    Promise.resolve(em_crypto.methodCaller(method, params))
    .then((response) => {
        let ret = {status: 1, buff: response, error: ""};
        Module.ccall('AsyncEngine_onSuccess', null, ['number', 'number'], [callId, Emval.toHandle(ret)]);
    })
    .catch((error) => {
        console.error("Bindings Error [" + method + "]", error);
        let ret = {status: -1, buff: "", error: error.toString()};
        Module.ccall('AsyncEngine_onError', null, ['number', 'number'], [callId, Emval.toHandle(ret)]);
    });
});

void performBindingsCall(const std::string& method, emscripten::val params, int callId) {
    performBindingsCall_impl(method.c_str(), params.as_handle(), callId);
}