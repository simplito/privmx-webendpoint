#include "RemoteExecutor.hpp"
#include <emscripten/emscripten.h>

#include <iostream>

// --- Generic C-API Callbacks exposed to JavaScript ---
extern "C" {

EMSCRIPTEN_KEEPALIVE
void RemoteExecutor_onSuccess(int id, emscripten::EM_VAL result_handle) {
    // Forward to the singleton
    RemoteExecutor::getInstance().resolve(id, emscripten::val::take_ownership(result_handle));
}

EMSCRIPTEN_KEEPALIVE
void RemoteExecutor_onError(int id, emscripten::EM_VAL error_handle) {
    // Forward to the singleton
    RemoteExecutor::getInstance().reject(id, emscripten::val::take_ownership(error_handle));
}

} // extern "C"


// --- RemoteExecutor Implementation ---

RemoteExecutor& RemoteExecutor::getInstance() {
    static RemoteExecutor instance;
    return instance;
}

// std::future<emscripten::val> RemoteExecutor::execute(std::function<void(int)> starterFunc) {
//     // 1. Create Promise & Future
//     auto prms = std::make_shared<std::promise<emscripten::val>>();
//     std::future<emscripten::val> ftr = prms->get_future();

//     // 2. Generate ID and Store
//     int id = _nextId++;
//     {
//         std::lock_guard<std::mutex> lock(_mutex);
//         _promises[id] = prms;
//     }

//     // 3. Trigger the JS call (passing the ID)
//     starterFunc(id);

//     // 4. Return future immediately
//     return ftr;
// }

std::future<emscripten::val> RemoteExecutor::execute(
    std::function<void(int id)> starterFunc)
{
    auto prms = std::make_shared<std::promise<emscripten::val>>();
    std::future<emscripten::val> ftr = prms->get_future();

    pthread_t callingThread = pthread_self();

    int id = _nextId++;
    {
        std::lock_guard<std::mutex> lock(_mutex);
        _promises[id] = { prms, callingThread };
    }

    starterFunc(id);
    return ftr;
}

void RemoteExecutor::resolve(int id, emscripten::val result) {
    // std::shared_ptr<std::promise<emscripten::val>> prms = nullptr;
    // {
    //     std::lock_guard<std::mutex> lock(_mutex);
    //     auto it = _promises.find(id);
    //     if (it != _promises.end()) {
    //         prms = it->second;
    //         _promises.erase(it);
    //     }
    // }

    // if (prms) {
    //     prms->set_value(result);
    // } else {
    //     std::cerr << "RemoteExecutor: Success callback received for unknown ID " << id << std::endl;
    // }

    StoredPromise stored;
    {
        std::lock_guard<std::mutex> lock(_mutex);
        auto it = _promises.find(id);
        if (it == _promises.end()) {
            std::cerr << "RemoteExecutor: Success callback received for unknown ID "
                      << id << std::endl;
            return;
        }
        stored = it->second;
        _promises.erase(it);
    }

    // proxy na wątek który zainicjował future
    _proxyQueue.proxyAsync(
        stored.callingThread,
        [stored, result = std::move(result)]() mutable {
            stored.prms->set_value(result);
        }
    );
}

void RemoteExecutor::reject(int id, emscripten::val error) {
    StoredPromise stored;

    {
        std::lock_guard<std::mutex> lock(_mutex);
        auto it = _promises.find(id);
        if (it == _promises.end()) {
            std::cerr << "RemoteExecutor: Error callback received for unknown ID "
                      << id << std::endl;
            return;
        }
        stored = it->second;
        _promises.erase(it);
    }

    std::string errorMsg = "Unknown JS Error";
    try {
        if (error.isString())
            errorMsg = error.as<std::string>();
        else
            errorMsg = error.call<std::string>("toString");
    } catch (...) {}

    _proxyQueue.proxyAsync(
        stored.callingThread,
        [stored, errorMsg]() mutable {
            stored.prms->set_exception(
                std::make_exception_ptr(std::runtime_error(errorMsg))
            );
        }
    );
}