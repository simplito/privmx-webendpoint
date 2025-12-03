/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#pragma once

#include <emscripten/val.h>
#include <emscripten/proxying.h>
#include <Poco/Dynamic/Var.h>
#include <Poco/JSON/Object.h>
#include <future>
#include <map>
#include <mutex>
#include <atomic>
#include <functional>
#include <memory>
#include <vector>
#include <type_traits>

namespace privmx {
namespace webendpoint {

class WorkerPool;

/**
 * @enum ThreadTarget
 * @brief Specifies the destination thread for asynchronous JavaScript calls.
 */
enum class ThreadTarget {
    Main,   ///< The Browser Main Thread.
    Worker  ///< The Background Worker Thread (Task Manager Thread).
};

/**
 * @class AsyncEngine
 * @brief A central singleton engine for managing concurrency and C++/JS interop in WebAssembly.
 * * This class unifies three core responsibilities:
 * 1. Scheduling heavy C++ tasks on a background WorkerPool to avoid blocking the main thread.
 * 2. Dispatching tasks specifically to the Browser Main Thread (e.g., for DOM access).
 * 3. Bridging asynchronous JavaScript calls with C++ std::future/promises, allowing C++
 * to "await" JS operations in a similar manner as -sAsyncify.
 */
class AsyncEngine {
public:
    using ErrorHandler = std::function<void(std::exception_ptr, Poco::JSON::Object::Ptr&)>;
    /**
     * @brief Retrieves the singleton instance of the AsyncEngine.
     * @return Pointer to the global AsyncEngine instance. Creates it if it doesn't exist.
     * @note This method is thread-safe.
     */
    static AsyncEngine* getInstance();
    
    // Disable copy and move semantics to enforce Singleton pattern.
    AsyncEngine(const AsyncEngine&) = delete;
    void operator=(const AsyncEngine&) = delete;

    // Allow setting the handler (e.g., via constructor or setter)
    void setErrorHandler(ErrorHandler handler) {
        _errorHandler = handler;
    }

    /**
     * @brief Posts a task to the background worker pool.
     * * This template method automatically detects the return type of the provided callable.
     * - If the task returns `void`, it is dispatched as a void task.
     * - If the task returns a value, it is wrapped to ensure it returns a `Poco::Dynamic::Var`.
     * * @tparam Callable The type of the function or lambda to execute.
     * @param taskId An arbitrary integer ID to track the task (useful for logging or callbacks).
     * @param task The function or lambda to execute on a worker thread.
     */
    template <typename Callable>
    void postWorkerTask(int taskId, Callable&& task) {
        using ReturnType = typename std::invoke_result<Callable>::type;
        
        if constexpr (std::is_void<ReturnType>::value) {
            // Task returns void
            _postWorkerTaskVoid(taskId, std::forward<Callable>(task));
        } else {
            // Task returns a value (assumed convertible to Poco::Dynamic::Var)
            // We wrap it to ensure the type signature matches exactly
            _postWorkerTaskVar(taskId, [task = std::forward<Callable>(task)]() -> Poco::Dynamic::Var {
                return task();
            });
        }
    }
    
    /**
     * @brief Sets the JavaScript callback function that receives results from worker tasks.
     * * When a task posted via `postWorkerTask` completes, this callback is invoked 
     * on the Main Thread with the result object.
     * * @param callback A JavaScript function handle (emscripten::val).
     */
    void setResultsCallback(emscripten::val callback);

    // --- Thread Dispatch API ---

    /**
     * @brief Dispatches a void function to run specifically on the Browser Main Thread.
     * * If called from the Main Thread, it may execute immediately or be queued.
     * If called from a Worker, it proxies the execution to the Main Thread.
     * * @param task The void function to execute.
     */
    void dispatchToMainThread(const std::function<void(void)>& task);

    /**
     * @brief Dispatches a void function to run on a specific POSIX thread.
     * * @param task The void function to execute.
     * @param target The pthread_t handle of the target thread.
     */
    void dispatchToThread(const std::function<void(void)>& task, pthread_t target);

    // --- Remote JS Call API ---

    /**
     * @brief Calls a JavaScript function asynchronously and returns a C++ Future for the result.
     * * This mechanism allows C++ to invoke a JS function (the "starter"), pass it a generated
     * `callId`, and wait for the JS side to report success or failure via `AsyncEngine_onSuccess`
     * or `AsyncEngine_onError`.
     * * @param starterFunc A lambda that receives a `callId` (int). Inside this lambda, 
     * you must call the actual JS function and pass the `callId` to it.
     * @param target The thread where `starterFunc` should execute.
     * @return std::future<Poco::Dynamic::Var> A future that will resolve with the result 
     * from JavaScript (converted to a Poco Var).
     */
    std::future<Poco::Dynamic::Var> callJsAsync(
        std::function<void(int callId)> starterFunc, 
        ThreadTarget target = ThreadTarget::Main
    );

    /**
     * @brief Internal callback used by the global C-API to resolve a pending JS call.
     * * @param callId The unique ID of the async call.
     * @param result The successful result from JavaScript (emscripten::val).
     */
    void handleJsResult(int callId, emscripten::val result);

    /**
     * @brief Internal callback used by the global C-API to reject a pending JS call.
     * * @param callId The unique ID of the async call.
     * @param error The error object/message from JavaScript (emscripten::val).
     */
    void handleJsError(int callId, emscripten::val error);

private:
    AsyncEngine();
    ~AsyncEngine();

    // Internal implementations (Renamed to avoid ambiguity)
    void _postWorkerTaskVar(int taskId, const std::function<Poco::Dynamic::Var(void)>& task);
    void _postWorkerTaskVoid(int taskId, const std::function<void(void)>& task);

    static AsyncEngine* _instance;
    static std::mutex _instanceMutex;
    static pthread_t _mainThread;
    
    ErrorHandler _errorHandler; ///< Optional custom error handler
    std::thread _taskManagerThread; ///< Thread responsible for managing the runtime keepalive.
    emscripten::ProxyingQueue _proxingQueue; ///< Queue for proxying calls between threads.
    std::unique_ptr<WorkerPool> _pool; ///< Pool of worker threads for heavy tasks.
    emscripten::val _callback = emscripten::val::undefined(); ///< Registered JS callback for worker results.

    // Internal task execution wrappers
    void executeWorkerTask(int taskId, const std::function<Poco::Dynamic::Var(void)>& task);
    void executeWorkerTask(int taskId, const std::function<void(void)>& task);
    void postResultToMain(const Poco::Dynamic::Var& result);

    // Remote Call State management
    std::mutex _promiseMutex;
    std::atomic<int> _nextCallId {1};
    std::map<int, std::shared_ptr<std::promise<Poco::Dynamic::Var>>> _promises;
};

} // namespace webendpoint
} // namespace privmx