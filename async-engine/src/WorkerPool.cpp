#include "WorkerPool.hpp"

#include <utility>

namespace privmx {
namespace webendpoint {

WorkerPool::WorkerPool(size_t numThreads)
    : stop(false) 
{
    for (size_t i = 0; i < numThreads; ++i) {
        workers.emplace_back([this] {
            this->worker_loop();
        });
    }
}

WorkerPool::~WorkerPool() {
    {
        std::unique_lock<std::mutex> lock(queue_mutex);
        stop = true;
    }

    condition.notify_all();

    for (std::thread &worker : workers) {
        if (worker.joinable()) {
            worker.join();
        }
    }
}

void WorkerPool::enqueue(std::function<void()> task) {
    {
        std::unique_lock<std::mutex> lock(queue_mutex);
        if (stop) {
            return;
        }
        tasks.emplace(std::move(task));
    }
    condition.notify_one();
}

void WorkerPool::worker_loop() {
    while (true) {
        std::function<void()> task;
        {
            std::unique_lock<std::mutex> lock(queue_mutex);
            condition.wait(lock, [this] {
                return this->stop || !this->tasks.empty();
            });

            if (this->stop && this->tasks.empty()) {
                return;
            }

            task = std::move(tasks.front());
            tasks.pop();
        }
        
        try {
            task();
        } catch (...) {
        }
    }
}

} // namespace webendpoint
} // namespace privmx