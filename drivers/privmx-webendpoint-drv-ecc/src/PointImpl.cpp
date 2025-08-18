/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#include <emscripten/emscripten.h>
#include <emscripten/val.h>

#include <privmx/drv/BNImpl.hpp>
#include <privmx/drv/Bindings.hpp>
#include <privmx/drv/ECCImpl.hpp>
#include <privmx/drv/PointImpl.hpp>

using namespace std;


PointImpl::Ptr PointImpl::fromBuffer(const string& data) {
    return std::make_unique<PointImpl>(data);
}

PointImpl::Ptr PointImpl::getDefault() {
    return std::make_unique<PointImpl>();
}

PointImpl::PointImpl(const PointImpl& obj) : _point(obj._point) {}

PointImpl::PointImpl(PointImpl&& obj) : _point(std::move(obj._point)) {}

PointImpl::PointImpl(const std::string& point) : _point(point) {}

PointImpl& PointImpl::operator=(const PointImpl& obj) {
    _point = obj._point;
    return *this;
}

PointImpl& PointImpl::operator=(PointImpl&& obj) {
    _point = std::move(obj._point);
    return *this;
}

string PointImpl::encode(bool compact) const {
    return _point;
    validate();
    emscripten::val name { emscripten::val::u8string("point_encode") };
    emscripten::val params { emscripten::val::object() };
    params.set("point", emscripten::typed_memory_view(_point.size(), _point.data()));
    params.set("compact", compact);

    emscripten::val result = Bindings::callJSRawSync(name, params);
    int status = result["status"].as<int>();
    if (status < 0) {
        auto errorString = result["error"].as<std::string>();
        Bindings::printErrorInJS(errorString);
        throw std::runtime_error("Error: on point_encode");
    }

    return result["buff"].as<std::string>();
}

PointImpl::Ptr PointImpl::mul(const BNImpl& bn) const {
    validate();
    emscripten::val name { emscripten::val::u8string("point_mul") };
    emscripten::val params { emscripten::val::object() };
    params.set("point", emscripten::typed_memory_view(_point.size(), _point.data())); 
    params.set("bn", emscripten::typed_memory_view(bn.toBuffer().size(), bn.toBuffer().data())); 

    emscripten::val result = Bindings::callJSRawSync(name, params);
    int status = result["status"].as<int>();
    if (status < 0) {
        auto errorString = result["error"].as<std::string>();
        Bindings::printErrorInJS(errorString);
        throw std::runtime_error("Error: on point_mul");
    }

    return std::make_unique<PointImpl>(result["buff"].as<std::string>());
}

PointImpl::Ptr PointImpl::add(const PointImpl& point) const {
    validate();
    emscripten::val name { emscripten::val::u8string("point_add") };
    emscripten::val params { emscripten::val::object() };
    params.set("point", emscripten::typed_memory_view(_point.size(), _point.data())); 
    params.set("point2", emscripten::typed_memory_view(point._point.size(), point._point.data())); 

    emscripten::val result = Bindings::callJSRawSync(name, params);
    int status = result["status"].as<int>();
    if (status < 0) {
        auto errorString = result["error"].as<std::string>();
        Bindings::printErrorInJS(errorString);
        throw std::runtime_error("Error: on point_add");
    }

    return std::make_unique<PointImpl>(result["buff"].as<std::string>());
    
}

void PointImpl::validate() const {
    if (_point.empty()) {
        //throw CryptoException("Empty Point");
    }
}
