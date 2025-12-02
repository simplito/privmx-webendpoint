/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#include "ProxyedTaskRunner.hpp"

#include <emscripten/eventloop.h>
#include <Poco/JSON/Object.h>
#include <privmx/endpoint/core/Exception.hpp>

#include "Mapper.hpp"
#include "WorkerPool.hpp"

#include <queue>
#include <vector>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <functional>
#include <atomic>
#include <memory>

using namespace privmx::webendpoint;

namespace privmx {
    namespace webendpoint {
        
        EM_JS(void, pushToJsCallbackQueue,(emscripten::EM_VAL callbackHandle, emscripten::EM_VAL valueHandle), {
            const callback = Emval.toValue(callbackHandle);
            const value = Emval.toValue(valueHandle);
            setTimeout(()=>callback(value), 0);
        });
        
    }
}


ProxyedTaskRunner* ProxyedTaskRunner::_instance = nullptr;
std::mutex ProxyedTaskRunner::_instanceMutex;
pthread_t ProxyedTaskRunner::_mainThread = pthread_self();
std::unique_ptr<WorkerPool> _pool = nullptr;

ProxyedTaskRunner *ProxyedTaskRunner::getInstance() {
    std::lock_guard<std::mutex> lock(_instanceMutex);
    if (_instance == nullptr)
    {
        _instance = new ProxyedTaskRunner();
    }
    return _instance;
}

ProxyedTaskRunner::ProxyedTaskRunner() {
    _pool = std::make_unique<WorkerPool>(4);
    _taskManagerThread = std::thread([&]{
        emscripten_runtime_keepalive_push();
    });
}

ProxyedTaskRunner::~ProxyedTaskRunner() {}

void ProxyedTaskRunner::runTask(int taskId, const std::function<Poco::Dynamic::Var(void)>& function) {
    _proxingQueue.proxyAsync(_taskManagerThread.native_handle(), [&, taskId, function]{
        execAsync(taskId, function);
    });
}

void ProxyedTaskRunner::runTaskVoid(int taskId, const std::function<void(void)>& function) {
    _proxingQueue.proxyAsync(_taskManagerThread.native_handle(), [&, taskId, function]{
        execAsyncVoid(taskId, function);
    });
}

void ProxyedTaskRunner::setResultsCallback(emscripten::val callback) {
    _callback = callback;
}

void ProxyedTaskRunner::execAsync(int taskId, const std::function<Poco::Dynamic::Var(void)>& function) {
    _pool->enqueue([&, function, taskId]{
        Poco::JSON::Object::Ptr result = Poco::JSON::Object::Ptr(new Poco::JSON::Object());
        result->set("taskId", taskId);
        try {
            result->set("result", function());
            result->set("status", true);
        } catch (const privmx::endpoint::core::Exception& e) {
            Poco::JSON::Object::Ptr error = new Poco::JSON::Object();
            error->set("code", (int64_t)e.getCode());
            error->set("name", e.getName());
            error->set("scope", e.getScope());
            error->set("description", e.getDescription());
            error->set("full", e.getFull());
            result->set("error", error);
            result->set("status", false);
        } catch (const std::exception& e) {
            result->set("error", e.what());
            result->set("status", false);
        } catch (...) {
            result->set("error", "Error");
            result->set("status", false);
        }
        
        emitResult(result);
    });
}

void ProxyedTaskRunner::execAsyncVoid(int taskId, const std::function<void(void)>& function) {
    _pool->enqueue([&, function, taskId]{
        Poco::JSON::Object::Ptr result = Poco::JSON::Object::Ptr(new Poco::JSON::Object());
        result->set("taskId", taskId);       
        try {
            result->set("result", "");
            result->set("status", true);
            function();
        } catch (const privmx::endpoint::core::Exception& e) {
            Poco::JSON::Object::Ptr error = new Poco::JSON::Object();
            error->set("code", (int64_t)e.getCode());
            error->set("name", e.getName());
            error->set("scope", e.getScope());
            error->set("description", e.getDescription());
            error->set("full", e.getFull());
            result->set("error", error);
            result->set("status", false);
        } catch (const std::exception& e) {
            result->set("error", e.what());
            result->set("status", false);
        } catch (...) {
            result->set("error", "Error");
            result->set("status", false);
        }
        
        emitResult(result);
    });
}

void ProxyedTaskRunner::emitResult(const Poco::Dynamic::Var& result) {
    runInMainThreadVoid([&, result]{
        emscripten::val valResult = Mapper::map((pson_value*)&result); 
        pushToJsCallbackQueue(_callback.as_handle(), valResult.as_handle());
    });
}

void ProxyedTaskRunner::runInMainThreadVoid(const std::function<void(void)>& function) {
    if (pthread_self() != _mainThread) {
        _proxingQueue.proxySync(_mainThread, [&]{
            function();
        });
    } else {
        function();
    }
}