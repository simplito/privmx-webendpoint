/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#include <stdexcept>
#include <vector>
#include <string>

#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#include <secp256k1.h>

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

string PointImpl::encode(secp256k1_context* ctx, bool compact) const {
    validate();
    if (!_point.empty()) {
        unsigned char prefix = static_cast<unsigned char>(_point[0]);
        if (compact && _point.size() == 33) {
            if (prefix == 0x02 || prefix == 0x03) {
                return _point;
            }
        }
        else if (!compact && _point.size() == 65) {
            if (prefix == 0x04) {
                return _point;
            }
        }
    }
    if (ctx == nullptr) {
        throw std::runtime_error("Error: Failed to get secp256k1 context");
    }
    secp256k1_pubkey pubkey;
    if (!secp256k1_ec_pubkey_parse(ctx, &pubkey, 
                                  reinterpret_cast<const unsigned char*>(_point.data()), 
                                  _point.size())) {
        throw std::runtime_error("Error: Failed to parse point data");
    }
    unsigned int flags = compact ? SECP256K1_EC_COMPRESSED : SECP256K1_EC_UNCOMPRESSED;
    size_t output_size = compact ? 33 : 65;
    std::vector<unsigned char> output_buffer(output_size);
    size_t output_len = output_size;
    int ret = secp256k1_ec_pubkey_serialize(ctx, 
                                           output_buffer.data(), 
                                           &output_len, 
                                           &pubkey, 
                                           flags);

    if (!ret) {
        throw std::runtime_error("Error: Failed to serialize point");
    }
    if (output_len != output_size) {
        throw std::runtime_error("Error: Serialized point has unexpected length");
    }
    return std::string(output_buffer.begin(), output_buffer.end());
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
