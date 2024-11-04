/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#ifndef __PRIVMX_DRIVER_BINDINGS_H__
#define __PRIVMX_DRIVER_BINDINGS_H__

#include <exception>
#include <emscripten.h>
#include <emscripten/val.h>
#include <emscripten/bind.h>

using namespace emscripten;

class Bindings {
    public:
    static emscripten::val callJSRawSync(emscripten::val& name, emscripten::val& params);
    static void printErrorInJS(std::string& msg);

    template <typename T>
    static T callJSSync(emscripten::val& name, emscripten::val& params) {
        emscripten::val result = callJSRawSync(name, params);
        int status = result["status"].as<int>();
        if (status < 0) {
            auto errorString = result["error"].as<std::string>();
            printErrorInJS(errorString);
            throw std::exception();
        }
        return result["buff"].as<T>();
    }
};

#endif // __PRIVMX_DRIVER_BINDINGS_H__
