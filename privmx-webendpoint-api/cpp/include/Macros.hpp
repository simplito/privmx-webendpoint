/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/
#include <privmx/utils/Utils.hpp>

#ifndef _PRIVMXLIB_WEBENDPOINT_MACROS_HPP_
#define _PRIVMXLIB_WEBENDPOINT_MACROS_HPP_

#define FUNCTION_NAME(SERVICE, NAME) SERVICE##_## NAME
#define QUOTE(ARG) #ARG
#define FUNCTION_NAME_QUOTED(SERVICE, NAME) QUOTE(SERVICE##_##NAME)

#define BINDING_FUNCTION(SERVICE, NAME) emscripten::function( FUNCTION_NAME_QUOTED(SERVICE, NAME), &privmx::webendpoint::api::FUNCTION_NAME(SERVICE, NAME));
#define BINDING_FUNCTION_MIN(NAME) emscripten::function(#NAME, &privmx::webendpoint::api::NAME);

#define API_FUNCTION_HEADER(SERVICE, NAME)                                                      \
void FUNCTION_NAME(SERVICE, NAME) (int taskId, int ptr, emscripten::val args);

#define API_FUNCTION(SERVICE, NAME)                                                             \
void FUNCTION_NAME(SERVICE, NAME) (int taskId, int ptr, emscripten::val args) {                 \
    Poco::Dynamic::Var argsVar = Mapper::map(args);                                             \
    AsyncEngine::getInstance()->postWorkerTask(taskId,[&, ptr, argsVar] {                       \
        return ((SERVICE##Var*)ptr)->NAME(argsVar);                                             \
    });                                                                                         \
}

#endif // _PRIVMXLIB_WEBENDPOINT_MACROS_HPP_