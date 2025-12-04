#include "RemoteExecutor.hpp"
#include "Mapper.hpp"
#include <emscripten/emscripten.h>
#include <iostream>
#include <stdexcept>

using namespace privmx::webendpoint;

extern "C" {

EMSCRIPTEN_KEEPALIVE
void RemoteExecutor_onSuccess(int id, emscripten::EM_VAL result_handle) {
    RemoteExecutor::getInstance().resolve(id, emscripten::val::take_ownership(result_handle));
}

EMSCRIPTEN_KEEPALIVE
void RemoteExecutor_onError(int id, emscripten::EM_VAL error_handle) {
    RemoteExecutor::getInstance().reject(id, emscripten::val::take_ownership(error_handle));
}

} // extern "C"

RemoteExecutor& RemoteExecutor::getInstance() {
    static RemoteExecutor instance;
    return instance;
}

std::future<Poco::Dynamic::Var> RemoteExecutor::execute(std::function<void(int)> jsStarterFunc) {
    auto prms = std::make_shared<std::promise<Poco::Dynamic::Var>>();
    std::future<Poco::Dynamic::Var> ftr = prms->get_future();
    int id = _nextId++;
    {
        std::lock_guard<std::mutex> lock(_mutex);
        _promises[id] = prms;
    }
    try {
        jsStarterFunc(id);
    } catch (...) {
        std::lock_guard<std::mutex> lock(_mutex);
        _promises.erase(id);
        throw; 
    }
    return ftr;
}

void RemoteExecutor::resolve(int id, emscripten::val result) {
    std::shared_ptr<std::promise<Poco::Dynamic::Var>> prms = nullptr;
    {
        std::lock_guard<std::mutex> lock(_mutex);
        auto it = _promises.find(id);
        if (it != _promises.end()) {
            prms = it->second;
            _promises.erase(it);
        }
    }
    if (prms) {
        try {
            Poco::Dynamic::Var convertedResult = Mapper::map(result);
            prms->set_value(convertedResult);
        } catch (const std::exception& e) {
            prms->set_exception(std::make_exception_ptr(e));
        } catch (...) {
            prms->set_exception(std::make_exception_ptr(std::runtime_error("Unknown mapping error in RemoteExecutor")));
        }
    } else {
        std::cerr << "[RemoteExecutor] Warning: Received resolve for unknown ID " << id << std::endl;
    }
}

void RemoteExecutor::reject(int id, emscripten::val error) {
    std::shared_ptr<std::promise<Poco::Dynamic::Var>> prms = nullptr;
    {
        std::lock_guard<std::mutex> lock(_mutex);
        auto it = _promises.find(id);
        if (it != _promises.end()) {
            prms = it->second;
            _promises.erase(it);
        }
    }
    if (prms) {
        std::string errorMsg = "Unknown JS Error";
        try {
            if (error.isString()) {
                errorMsg = error.as<std::string>();
            } else {
                errorMsg = error.call<std::string>("toString");
            }
        } catch (...) {}
        prms->set_exception(std::make_exception_ptr(std::runtime_error(errorMsg)));
    } else {
        std::cerr << "[RemoteExecutor] Warning: Received reject for unknown ID " << id << std::endl;
    }
}
