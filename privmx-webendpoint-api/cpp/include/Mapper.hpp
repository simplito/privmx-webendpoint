/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#ifndef _PRIVMXLIB_WEBENDPOINT_MAPPER_HPP_
#define _PRIVMXLIB_WEBENDPOINT_MAPPER_HPP_

#include <Poco/Dynamic/Var.h>

#include <Pson/pson.h>

#include <emscripten/val.h>

namespace privmx {
namespace webendpoint {

class Mapper {
public:
    static Poco::Dynamic::Var map(emscripten::val value);
    static emscripten::val map(pson_value* value);
    static emscripten::val convertInt64ToJsSafeInteger(const int64_t val);
};

} // namespace webebdpoint
} // namespace privmx

#endif // _PRIVMXLIB_WEBENDPOINT_MAPPER_HPP_
