/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.
*/

#include "AsyncEngine.hpp"
#include "Mapper.hpp"
#include "WorkerPool.hpp"

#include <Pson/BinaryString.hpp>
#include <Pson/pson.h>

#include <emscripten/eventloop.h>
#include <Poco/JSON/Object.h>
#include <iostream>
#include <stdexcept>

using namespace privmx::webendpoint;

extern "C" {
    EMSCRIPTEN_KEEPALIVE
    void AsyncEngine_onSuccess(int id, emscripten::EM_VAL result_handle) {
        auto instance = AsyncEngine::getInstance();
        if(instance) instance->handleJsResult(id, emscripten::val::take_ownership(result_handle));
    }

    EMSCRIPTEN_KEEPALIVE
    void AsyncEngine_onError(int id, emscripten::EM_VAL error_handle) {
        auto instance = AsyncEngine::getInstance();
        if(instance) instance->handleJsError(id, emscripten::val::take_ownership(error_handle));
    }
}

namespace privmx {
    namespace webendpoint {
        EM_JS(void, pushToJsCallbackQueue,(emscripten::EM_VAL callbackHandle, emscripten::EM_VAL valueHandle), {
            const callback = Emval.toValue(callbackHandle);
            const value = Emval.toValue(valueHandle);
            setTimeout(()=>callback(value), 0);
        });
    }
}

AsyncEngine* AsyncEngine::_instance = nullptr;
std::mutex AsyncEngine::_instanceMutex;
pthread_t AsyncEngine::_mainThread = pthread_self();

AsyncEngine *AsyncEngine::getInstance() {
    if (_instance == nullptr) {
        _instance = new AsyncEngine();
    }
    return _instance;
}

AsyncEngine::AsyncEngine() {
    _pool = std::make_unique<WorkerPool>(2);
    _taskManagerThread = std::thread([&]{
        emscripten_runtime_keepalive_push();
    });
}

AsyncEngine::~AsyncEngine() {}

void AsyncEngine::_postWorkerTaskVar(int taskId, const std::function<Poco::Dynamic::Var(void)>& task) {
    _proxingQueue.proxyAsync(_taskManagerThread.native_handle(), [&, taskId, task]{
        executeWorkerTask(taskId, task);
    });
}

void AsyncEngine::_postWorkerTaskVoid(int taskId, const std::function<void(void)>& task) {
    _proxingQueue.proxyAsync(_taskManagerThread.native_handle(), [&, taskId, task]{
        executeWorkerTask(taskId, task);
    });
}

void AsyncEngine::setResultsCallback(emscripten::val callback) {
    _callback = callback;
}

void AsyncEngine::executeWorkerTask(int taskId, const std::function<Poco::Dynamic::Var(void)>& task) {
    auto errorHandler = _errorHandler;
    _pool->enqueue([=]{
        Poco::JSON::Object::Ptr result = new Poco::JSON::Object();
        result->set("taskId", taskId);
        try {
            result->set("result", task());
            result->set("status", true);
        }
        catch (...) {
            result->set("status", false);
            Poco::JSON::Object::Ptr errorObj = new Poco::JSON::Object();
            bool handled = false;
            if (errorHandler) {
                try {
                    errorHandler(std::current_exception(), errorObj);
                    handled = true;
                } catch (...) {
                    errorObj->set("error", "Error handler crashed");
                }
            }
            if (!handled || errorObj->size() == 0) {
                 try {
                     throw;
                 } catch (const std::exception& e) {
                     errorObj->set("error", e.what());
                 } catch (...) {
                     errorObj->set("error", "Unknown Error");
                 }
            }
            result->set("error", errorObj);
        }
        postResultToMain(result);
    });
}

void AsyncEngine::executeWorkerTask(int taskId, const std::function<void(void)>& task) {
    auto errorHandler = _errorHandler;
    _pool->enqueue([=]{
        Poco::JSON::Object::Ptr result = new Poco::JSON::Object();
        result->set("taskId", taskId);
        try {
            result->set("result", "");
            result->set("status", true);
            task();
        }
        catch (...) {
            result->set("status", false);
            Poco::JSON::Object::Ptr errorObj = new Poco::JSON::Object();
            bool handled = false;
            if (errorHandler) {
                try {
                    errorHandler(std::current_exception(), errorObj);
                    handled = true;
                } catch (...) {
                    errorObj->set("error", "Error handler crashed");
                }
            }
            if (!handled || errorObj->size() == 0) {
                 try {
                     throw;
                 } catch (const std::exception& e) {
                     errorObj->set("error", e.what());
                 } catch (...) {
                     errorObj->set("error", "Unknown Error");
                 }
            }
            result->set("error", errorObj);
        }
        postResultToMain(result);
    });
}

void AsyncEngine::postResultToMain(const Poco::Dynamic::Var& result) {
    dispatchToMainThread([&, result]{
        if (!_callback.isUndefined()) {
             Poco::Dynamic::Var localResult = result;
             emscripten::val valResult = Mapper::map((pson_value*)&localResult); 
             pushToJsCallbackQueue(_callback.as_handle(), valResult.as_handle());
        }
    });
}

void AsyncEngine::dispatchToMainThread(const std::function<void(void)>& task) {
    if (pthread_self() != _mainThread) {
        _proxingQueue.proxySync(_mainThread, [&]{
            task();
        });
    } else {
        task();
    }
}

void AsyncEngine::dispatchToThread(const std::function<void(void)>& task, pthread_t target) {
    _proxingQueue.proxySync(target, [&]{
        task();
    });
}

std::future<Poco::Dynamic::Var> AsyncEngine::callJsAsync(
    std::function<void(int callId)> starterFunc, 
    ThreadTarget target
) {
    auto prms = std::make_shared<std::promise<Poco::Dynamic::Var>>();
    std::future<Poco::Dynamic::Var> ftr = prms->get_future();

    int id = _nextCallId++;
    {
        std::lock_guard<std::mutex> lock(_promiseMutex);
        _promises[id] = prms;
    }

    if (target == ThreadTarget::Main) {
        _proxingQueue.proxyAsync(_mainThread, [starterFunc, id] {
             starterFunc(id);
        });
    } else {
        _proxingQueue.proxyAsync(_taskManagerThread.native_handle(), [starterFunc, id] {
             starterFunc(id);
        });
    }

    return ftr;
}

void AsyncEngine::handleJsResult(int callId, emscripten::val result) {
    std::shared_ptr<std::promise<Poco::Dynamic::Var>> prms = nullptr;

    {
        std::lock_guard<std::mutex> lock(_promiseMutex);
        auto it = _promises.find(callId);
        if (it != _promises.end()) {
            prms = it->second;
            _promises.erase(it);
        }
    }

    if (prms) {
        try {
            Poco::Dynamic::Var converted = Mapper::map(result);
            prms->set_value(converted);
        } catch (const std::exception& e) {
            prms->set_exception(std::make_exception_ptr(e));
        } catch (...) {
            prms->set_exception(std::make_exception_ptr(std::runtime_error("Unknown mapping error")));
        }
    } else {
        std::cerr << "[AsyncEngine] Warning: Unknown CallID " << callId << " in handleJsResult" << std::endl;
    }
}

void AsyncEngine::handleJsError(int callId, emscripten::val error) {
    std::shared_ptr<std::promise<Poco::Dynamic::Var>> prms = nullptr;

    {
        std::lock_guard<std::mutex> lock(_promiseMutex);
        auto it = _promises.find(callId);
        if (it != _promises.end()) {
            prms = it->second;
            _promises.erase(it);
        }
    }

    if (prms) {
        std::string msg = "Unknown JS Error";
        try {
            if (error.isString()) msg = error.as<std::string>();
            else msg = error.call<std::string>("toString");
        } catch(...) {}
        prms->set_exception(std::make_exception_ptr(std::runtime_error(msg)));
    } else {
         std::cerr << "[AsyncEngine] Warning: Unknown CallID " << callId << " in handleJsError" << std::endl;
    }
}