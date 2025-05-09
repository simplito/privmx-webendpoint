/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#include "Mapper.hpp"

#include <emscripten.h>
#include <emscripten/val.h>

#include <Poco/Dynamic/Var.h>
#include <Poco/JSON/Object.h>
#include <Poco/Types.h>

#include <Pson/BinaryString.hpp>
#include <Pson/pson.h>

#include <privmx/endpoint/core/Buffer.hpp>
#include <privmx/endpoint/core/Exception.hpp>

#define CANONICAL_NUMBER_FACTOR 1073741823 // 0b00111111111111111111111111111111 = 2^30 - 1
#define MIN_JS_SAFE_INTEGER -9007199254740991
#define MAX_JS_SAFE_INTEGER 9007199254740991

using namespace privmx::webendpoint;

namespace privmx {
namespace webendpoint {
namespace {

EM_JS(emscripten::EM_VAL, listKeysOfJsObject, (emscripten::EM_VAL valueHandle), {
    const value = Emval.toValue(valueHandle);
    const keys = Object.keys(value);
    keys.unshift(keys.length);
    return Emval.toHandle(keys);
});

EM_JS(int, getSizeOfJsArray,(emscripten::EM_VAL valueHandle), {
    const value = Emval.toValue(valueHandle);
    return value.length;
});

EM_JS(bool, checkIfJsValueIsSafeInteger,(emscripten::EM_VAL valueHandle), {
    const value = Emval.toValue(valueHandle);
    if(Number.isSafeInteger(value)){
        return true
    }
    return false;
});

EM_JS(emscripten::EM_VAL, convertCanonicalIntegerToJsSafeInteger, (bool isNegative, long mostPart, long leastPart), {
    let result = mostPart * 1073741823 + leastPart;
    if (isNegative) {
        result *= -1;
    }
    return Emval.toHandle(result);
});

EM_JS(emscripten::EM_VAL, convertJsSafeIntegerToCanonicalInteger, (emscripten::EM_VAL valueHandle), {
    let value = Emval.toValue(valueHandle);
    let isNegative = false;
    if (value < 0) {
        isNegative = true;
        value *= -1;
    }
    return Emval.toHandle({
        isNegative,
        mostPart: Math.floor(value / 1073741823),
        leastPart: value % 1073741823
    });
});

}
}
}

Poco::Dynamic::Var Mapper::map(emscripten::val value){
    std::string type = value.typeOf().as<std::string>();
    if (value.isNull()) {
        return Poco::Dynamic::Var();
    }
    if (type == "string") {
        return value.as<std::string>();
    }
    if (type == "number") {
        if (checkIfJsValueIsSafeInteger(value.as_handle())) {
            emscripten::val canonicalInteger = emscripten::val::take_ownership(convertJsSafeIntegerToCanonicalInteger(value.as_handle()));
            Poco::Int64 result = canonicalInteger["mostPart"].as<long>();
            result = result * CANONICAL_NUMBER_FACTOR + canonicalInteger["leastPart"].as<long>();
            if (canonicalInteger["isNegative"].as<bool>()) {
                result *= -1;
            }
            return result;
        } else {
            return value.as<double>();
        }
    }
    if (type == "boolean") {
        return value.as<bool>();
    }
    if (value.instanceof(emscripten::val::global("Uint8Array"))) {
        return privmx::endpoint::core::Buffer::from(value.as<std::string>());
    }
    if (value.isArray()) {
        Poco::JSON::Array::Ptr result = Poco::JSON::Array::Ptr(new Poco::JSON::Array());
        int size = getSizeOfJsArray(value.as_handle());
        for (int i = 0; i < size; ++i) {
            result->set(i, map(value[i]));
        }
        return result;
    }
    if (type == "object") {
        emscripten::val keys = emscripten::val::take_ownership(listKeysOfJsObject(value.as_handle()));
        Poco::JSON::Object::Ptr result = Poco::JSON::Object::Ptr(new Poco::JSON::Object());
        int size = keys[0].as<int>();
        for (int i = 1; i <= size; ++i) {
            result->set(keys[i].as<std::string>(), map(value[keys[i]]));
        }
        return result;
    }
    return Poco::Dynamic::Var();
}

emscripten::val Mapper::map(pson_value* res) {
    auto type = pson_value_type(res);
    switch (type) {
        case PSON_NULL:
            return emscripten::val::null();
        case PSON_BOOL:
            {
                int val;
                pson_get_bool(res, &val);
                return emscripten::val((bool)val);
            }
        case PSON_INT32:
            {
                int32_t val;
                pson_get_int32(res, &val);
                return emscripten::val((int)val);
            }
        case PSON_INT64:
            {
                int64_t val;
                pson_get_int64(res, &val);
                if (val < MIN_JS_SAFE_INTEGER || MAX_JS_SAFE_INTEGER < val) {
                    throw privmx::endpoint::core::Exception("Number exceeded js safe integer range");
                }
                bool isNegative = false;
                if (val < 0) {
                    isNegative = true;
                    val *= -1;
                }
                long mostPart = val / CANONICAL_NUMBER_FACTOR;
                long leastPart = val % CANONICAL_NUMBER_FACTOR;
                return emscripten::val::take_ownership(convertCanonicalIntegerToJsSafeInteger(isNegative, mostPart, leastPart));
            }
        case PSON_FLOAT32:
            {
                float val;
                pson_get_float32(res, &val);
                return emscripten::val(val);
            }
        case PSON_FLOAT64:
            {
                double val;
                pson_get_float64(res, &val);
                return emscripten::val(val);
            }
        case PSON_STRING:
            {
                const char* val = pson_get_cstring(res);
                return emscripten::val::u8string(val);
            }
        case PSON_BINARY:
            {
                const char* buf;
                size_t size;
                pson_inspect_binary(res, &buf, &size);
                emscripten::val view{emscripten::typed_memory_view(size, buf)};
                emscripten::val result = emscripten::val::global("Uint8Array").new_(size);
                result.call<void>("set", view);
                return result;
            }
        case PSON_ARRAY:
            {
                size_t size;
                pson_get_array_size(res, &size);
                emscripten::val result = emscripten::val::array();
                for (size_t i = 0; i < size; ++i) {
                    pson_value* element = pson_get_array_value(res, i);
                    result.call<int>("push", map(element));
                }
                return result;
            }
        case PSON_OBJECT:
            {
                emscripten::val object = emscripten::val::object();
                pson_object_iterator* it;
                const char* key;
                pson_value* val;
                if (pson_open_object_iterator(res, &it)) {
                    while (pson_object_iterator_next(it, &key, &val)) {
                        object.set(key, map(val));
                    }
                    pson_close_object_iterator(it);
                }
                return object;
            }
        case PSON_INVALID:
        default:
            {
                // Convert core::Buffer
                Poco::Dynamic::Var* tmp = (Poco::Dynamic::Var*)res;
                if (tmp->type() == typeid(privmx::endpoint::core::Buffer)) {
                    auto buf = tmp->extract<privmx::endpoint::core::Buffer>();
                    emscripten::val view{emscripten::typed_memory_view(buf.size(), buf.data())};
                    auto result = emscripten::val::global("Uint8Array").new_(buf.size());
                    result.call<void>("set", view);
                    return result;
                }
            }
            return emscripten::val::undefined();
    }
}

emscripten::val Mapper::convertInt64ToJsSafeInteger(int64_t val) {
    if (val < MIN_JS_SAFE_INTEGER || MAX_JS_SAFE_INTEGER < val) {
        std::cerr << "value is: " << val << std::endl;
        throw privmx::endpoint::core::Exception("Number exceeded js safe integer range");
    }
    bool isNegative = false;
    if (val < 0) {
        isNegative = true;
        val *= -1;
    }
    long mostPart = val / CANONICAL_NUMBER_FACTOR;
    long leastPart = val % CANONICAL_NUMBER_FACTOR;
    return emscripten::val::take_ownership(convertCanonicalIntegerToJsSafeInteger(isNegative, mostPart, leastPart));
}