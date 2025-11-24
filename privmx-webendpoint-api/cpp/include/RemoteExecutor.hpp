#pragma once

#include <emscripten/val.h>
#include <future>
#include <map>
#include <mutex>
#include <atomic>
#include <functional>
#include <memory>
#include <string>
#include <Poco/Dynamic/Var.h>

namespace privmx {
namespace webendpoint {

class RemoteExecutor {
public:
    static RemoteExecutor& getInstance();

    RemoteExecutor(const RemoteExecutor&) = delete;
    void operator=(const RemoteExecutor&) = delete;
    std::future<Poco::Dynamic::Var> execute(std::function<void(int id)> jsStarterFunc);
    void resolve(int id, emscripten::val result);
    void reject(int id, emscripten::val error);

private:
    RemoteExecutor() = default;

    std::mutex _mutex;
    std::atomic<int> _nextId {1};
    std::map<int, std::shared_ptr<std::promise<Poco::Dynamic::Var>>> _promises;
};

} // namespace webendpoint
} // namespace privmx