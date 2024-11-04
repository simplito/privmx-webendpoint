/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#ifndef _PRIVMXLIB_WEBENDPOINT_PROXYEDTASKRUNNER_HPP_
#define _PRIVMXLIB_WEBENDPOINT_PROXYEDTASKRUNNER_HPP_

#include <array>
#include <functional>
#include <future>
#include <mutex>
#include <thread>

#include <emscripten/emscripten.h>
#include <emscripten/proxying.h>
#include <emscripten/val.h>

#include <Poco/Dynamic/Var.h>

namespace privmx {
namespace webendpoint {

class ProxyedTaskRunner
{
public:
    static ProxyedTaskRunner* getInstance();
    ProxyedTaskRunner(ProxyedTaskRunner& other) = delete;
    void operator=(const ProxyedTaskRunner&) = delete;
    void runTask(int taskId, const std::function<Poco::Dynamic::Var(void)>& function);
    void runTaskVoid(int taskId, const std::function<void(void)>& function);
    void setResultsCallback(emscripten::val callback);

private:
    ProxyedTaskRunner();
    ~ProxyedTaskRunner();
    void execAsync(int taskId,const std::function<Poco::Dynamic::Var(void)>& function);
    void execAsyncVoid(int taskId, const std::function<void(void)>&function);
    int tryGetFreeSlot();
    void emitResult(const Poco::Dynamic::Var& result);
    void runInMainThreadVoid(const std::function<void(void)>& function);

    static ProxyedTaskRunner* _instance;
    static std::mutex _instanceMutex;
    static pthread_t _mainThread;
    emscripten::val _callback;
    emscripten::ProxyingQueue _proxingQueue;
    std::array<std::pair<bool, std::future<void>>, 8> _slots;
    std::mutex _slotsMutex;
    std::condition_variable _slotsNotifier;
    std::thread _taskManagerThread;
};

} // namespace webendpoint
} // namespace privmx

#endif // _PRIVMXLIB_WEBENDPOINT_PROXYEDTASKRUNNER_HPP_
