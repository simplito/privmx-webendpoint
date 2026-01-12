/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#include <cstdlib>
#include <iterator>
#include <string>
#include <emscripten/emscripten.h>
#include <emscripten/websocket.h>
#include <emscripten/bind.h>
#include <privmx/drv/net.h>
#include <memory>
#include <thread>
#include <future>
#include <vector>

#include <AsyncEngine.hpp>
#include "Mapper.hpp"
#include <Poco/Dynamic/Var.h>
#include <Poco/JSON/Object.h>
#include <Pson/BinaryString.hpp>

#include "privmx/drv/websocket.h"

using namespace privmx::webendpoint;

struct privmxDrvNet_Http {
    std::string uri;
};

struct privmxDrvNet_Ws {
    int websocketId;
};

// Helper to get origin from URL safely
EM_JS(emscripten::EM_VAL, getOrigin, (const char* url), {
    const new_url = new URL(UTF8ToString(url));
    const uri = new_url.origin;
    return Emval.toHandle(uri);
});

/**
 * Fetch wrapper for AsyncEngine.
 */
EM_JS(void, callJSFetch_async, (emscripten::EM_VAL val_handle, int callId), {
    let params = Emval.toValue(val_handle);
    let result = {status: -1, data: "", error: ""};
    
    fetch(params.url, params)
        .then(response => {
            return Promise.all([response.status, response.arrayBuffer()]);
        })
        .then(([status, data]) => {
            result = {status: status, data: new Uint8Array(data), error: ""};
            Module.ccall('AsyncEngine_onSuccess', null, ['number', 'number'], [callId, Emval.toHandle(result)]);
        })
        .catch(error => {
            result = {status: -1, data: "", error: error.toString()};
            Module.ccall('AsyncEngine_onError', null, ['number', 'number'], [callId, Emval.toHandle(result)]);
        });
});

std::thread wsWorker = std::thread([]{
    emscripten_runtime_keepalive_push();
});

std::future<Poco::Dynamic::Var> HTTPSendAsync(const std::string& data, const std::string& url, const std::string& content_type, bool get, const std::map<std::string,std::string>& request_headers, bool keepAlive) {
    return AsyncEngine::getInstance()->callJsAsync([=](int callId) {
        emscripten::val params = emscripten::val::object();
        emscripten::val headers = emscripten::val::object();
        
        params.set("url", url);
        params.set("method", get ? "GET" : "POST");
        
        if (!get) {
            params.set("body", emscripten::val::global("Uint8Array").new_(emscripten::typed_memory_view(data.size(), data.data())));
            
            headers.set("Content-Type", content_type);
            for (const auto& [key, value]: request_headers){
                headers.set(key, value);
            }
        }
        if (keepAlive) headers.set("Connection", "Keep-Alive");
        params.set("headers", headers);
        
        callJSFetch_async(params.as_handle(), callId);

    }, ThreadTarget::Worker);
}
 
int privmxDrvNet_version(unsigned int* version) {
    *version = 1;
    return 0;
}

int privmxDrvNet_setConfig(const char* config) {
    return 0;
}

int privmxDrvNet_httpCreateSession(const privmxDrvNet_HttpOptions* options, privmxDrvNet_Http** res) {
    try {
        std::string cpp_str_url(options->baseUrl);
        cpp_str_url = emscripten::val::take_ownership(getOrigin(cpp_str_url.c_str())).as<std::string>();
        *res = new privmxDrvNet_Http{cpp_str_url};
        return 0;
    } catch(...) {
        return 1;
    }
}

int privmxDrvNet_httpDestroySession(privmxDrvNet_Http* http) {
    return 0;
}

int privmxDrvNet_httpFree(privmxDrvNet_Http* http) {
    delete http;
    return 0;
}

int privmxDrvNet_httpRequest(privmxDrvNet_Http* http, const char* data, int datalen, const privmxDrvNet_HttpRequestOptions* options, int* statusCode, char** out, unsigned int* outlen) {
    try {
        std::string cpp_str_data(data, datalen);
        std::string path(options->path);
        path = http->uri + path;
        std::string contentType(options->contentType);
        std::string method(options->method);
        std::map<std::string,std::string> headers;
        for (int i = 0; i < options->headerslen; ++i) {
            headers.emplace(std::make_pair(std::string(options->headers[i].name), std::string(options->headers[i].value)));
        } 

        auto future = HTTPSendAsync(cpp_str_data, path, contentType, (method=="GET"), headers, options->keepAlive);
        
        Poco::Dynamic::Var resultVar = future.get();

        Poco::JSON::Object::Ptr obj = resultVar.extract<Poco::JSON::Object::Ptr>();
        int response_status = obj->getValue<int>("status");
        
        if (response_status < 0) return 1; 

        std::string response_data = obj->getValue<Pson::BinaryString>("data");

        char* buf = reinterpret_cast<char*>(malloc(response_data.size()));
        memcpy(buf, response_data.data(), response_data.size());
        
        *statusCode = response_status;
        *out = buf;
        *outlen = response_data.size();
        return 0;
    } catch (...) {
        return 1;
    }
}

int privmxDrvNet_wsConnect(const privmxDrvNet_WsOptions* options, 
                           void(*onopen)(void* ctx), 
                           void(*onmessage)(void* ctx, const char* msg, int msglen), 
                           void(*onerror)(void* ctx, const char* msg, int msglen), 
                           void(*onclose)(void* ctx, int wasClean), void* ctx,
                           privmxDrvNet_Ws** res){

    std::string cpp_str_uri("ws");
    cpp_str_uri.append(std::string(options->url).substr(4));

    auto promise = std::make_shared<std::promise<int>>();
    auto future = promise->get_future();

    AsyncEngine::getInstance()->dispatchToThread([=, uri = cpp_str_uri]{
        try {
            int id = wsCreateWebSocket(uri.c_str());
            
            wsSetUserPointer(id, ctx);
            wsSetOpenCallback(id, onopen);
            wsSetErrorCallback(id, onerror);
            wsSetMessageCallback(id, onmessage);
            wsSetCloseCallback(id, onclose);
            
            promise->set_value(id);
        } catch (...) {
            promise->set_value(-1);
        }
    }, wsWorker.native_handle());

    int websocketId = future.get();

    if (websocketId < 0) {
        return 1;
    }

    *res = new privmxDrvNet_Ws{.websocketId = websocketId};
    return 0;
}

int privmxDrvNet_wsClose(privmxDrvNet_Ws* ws) {
    if (!ws) return 1;
    int id = ws->websocketId;

    AsyncEngine::getInstance()->dispatchToThread([id]{
        try {
            wsDeleteWebSocket(id);
        } catch(...) {}
    }, wsWorker.native_handle());
    return 0;
}

int privmxDrvNet_wsFree(privmxDrvNet_Ws* ws) {
    delete ws;
    return 0;
}

int privmxDrvNet_wsSend(privmxDrvNet_Ws* ws, const char* data, int datalen) {
    if (!ws) return 1;
    std::string dataCopy(data, datalen);
    int id = ws->websocketId;
    auto promise = std::make_shared<std::promise<int>>();
    auto future = promise->get_future();
    AsyncEngine::getInstance()->dispatchToThread([=, dataStr = std::move(dataCopy)]() mutable {
        try {
            int res = wsSendMessage(id, dataStr.c_str(), dataStr.size());
            promise->set_value(res);
        } catch(...) {
            promise->set_value(-1);
        }
    }, wsWorker.native_handle());
    int result = future.get();

    if(result <= 0){
        return 1;
    } 
    return 0;
}

int privmxDrvNet_freeMem(void* ptr) {
    free(ptr);
    return 0;
}