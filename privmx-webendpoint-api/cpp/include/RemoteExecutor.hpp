#pragma once

#include <emscripten/val.h>
#include <future>
#include <map>
#include <mutex>
#include <atomic>
#include <functional>
#include <memory>
#include <emscripten/proxying.h>
#include <emscripten/threading.h>

class RemoteExecutor {
public:
    // Singleton access
    static RemoteExecutor& getInstance();

    // Delete copy/move
    RemoteExecutor(const RemoteExecutor&) = delete;
    void operator=(const RemoteExecutor&) = delete;

    /**
     * Registers a new async operation.
     * @param starterFunc A lambda that receives the unique 'id'. 
     * Inside this lambda, you call your specific EM_JS function.
     * @return A future containing the JS result (emscripten::val).
     */
    std::future<emscripten::val> execute(std::function<void(int id)> starterFunc);

    // Internal methods called by the static C-API
    void resolve(int id, emscripten::val result);
    void reject(int id, emscripten::val error);

private:
    RemoteExecutor() = default;
    emscripten::ProxyingQueue _proxyQueue;

    std::mutex _mutex;
    std::atomic<int> _nextId {1}; // Start at 1

struct StoredPromise {
    std::shared_ptr<std::promise<emscripten::val>> prms;
    pthread_t callingThread;
};

std::map<int, StoredPromise> _promises;
    // std::map<int, std::shared_ptr<std::promise<emscripten::val>>> _promises;
};
