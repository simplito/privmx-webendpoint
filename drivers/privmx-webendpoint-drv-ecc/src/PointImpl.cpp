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

#include <AsyncEngine.hpp>
#include "Mapper.hpp"
#include <Pson/BinaryString.hpp>
#include <Poco/Dynamic/Var.h>
#include <Poco/JSON/Object.h>

using namespace std;
using namespace emscripten;
using namespace privmx::webendpoint;

namespace {
    val createUint8Array(const std::string& data) {
        return val::global("Uint8Array").new_(typed_memory_view(data.size(), data.data()));
    }
}

PointImpl::Ptr PointImpl::fromBuffer(const string& data) { return std::make_unique<PointImpl>(data); }
PointImpl::Ptr PointImpl::getDefault() { return std::make_unique<PointImpl>(); }
PointImpl::PointImpl(const PointImpl& obj) : _point(obj._point) {}
PointImpl::PointImpl(PointImpl&& obj) : _point(std::move(obj._point)) {}
PointImpl::PointImpl(const std::string& point) : _point(point) {}
PointImpl& PointImpl::operator=(const PointImpl& obj) { _point = obj._point; return *this; }
PointImpl& PointImpl::operator=(PointImpl&& obj) { _point = std::move(obj._point); return *this; }

string PointImpl::encode(secp256k1_context* ctx, bool compact) const {
    validate();
    if (!_point.empty()) {
        unsigned char prefix = static_cast<unsigned char>(_point[0]);
        if (compact && _point.size() == 33 && (prefix == 0x02 || prefix == 0x03)) return _point;
        else if (!compact && _point.size() == 65 && prefix == 0x04) return _point;
    }
    if (ctx == nullptr) throw std::runtime_error("Error: Failed to get secp256k1 context");
    
    secp256k1_pubkey pubkey;
    if (!secp256k1_ec_pubkey_parse(ctx, &pubkey, reinterpret_cast<const unsigned char*>(_point.data()), _point.size())) {
        throw std::runtime_error("Error: Failed to parse point data");
    }
    unsigned int flags = compact ? SECP256K1_EC_COMPRESSED : SECP256K1_EC_UNCOMPRESSED;
    size_t output_size = compact ? 33 : 65;
    std::vector<unsigned char> output_buffer(output_size);
    size_t output_len = output_size;
    if (!secp256k1_ec_pubkey_serialize(ctx, output_buffer.data(), &output_len, &pubkey, flags)) {
        throw std::runtime_error("Error: Failed to serialize point");
    }
    if (output_len != output_size) throw std::runtime_error("Error: Serialized point has unexpected length");
    
    return std::string(output_buffer.begin(), output_buffer.end());
}

// ----------------------------------------------------------------------------
//  ASYNC OPERATIONS
// ----------------------------------------------------------------------------

PointImpl::Ptr PointImpl::mul(const BNImpl& bn) const {
    validate();
    
    std::string pointStr = _point;
    std::string bnStr = bn.toBuffer();

    auto future = AsyncEngine::getInstance()->callJsAsync([pointStr, bnStr](int callId) {
        val params = val::object();
        
        params.set("point", createUint8Array(pointStr));
        params.set("bn", createUint8Array(bnStr));

        performBindingsCall("point_mul", params, callId);
    }, ThreadTarget::Worker);

    Poco::Dynamic::Var resultVar = future.get();
    Poco::JSON::Object::Ptr obj = resultVar.extract<Poco::JSON::Object::Ptr>();
    
    int status = obj->getValue<int>("status");
    if (status < 0) {
        throw std::runtime_error("Error: on point_mul: " + obj->getValue<std::string>("error"));
    }

    return std::make_unique<PointImpl>(obj->getValue<Pson::BinaryString>("buff"));
}

PointImpl::Ptr PointImpl::add(const PointImpl& point) const {
    validate();
    
    std::string point1Str = _point;
    std::string point2Str = point._point;

    // 2. Execute Async
    auto future = AsyncEngine::getInstance()->callJsAsync([point1Str, point2Str](int callId) {
        val params = val::object();
        params.set("point", createUint8Array(point1Str));
        params.set("point2", createUint8Array(point2Str));

        performBindingsCall("point_add", params, callId);
    }, ThreadTarget::Worker);

    Poco::Dynamic::Var resultVar = future.get();
    Poco::JSON::Object::Ptr obj = resultVar.extract<Poco::JSON::Object::Ptr>();
    
    int status = obj->getValue<int>("status");
    if (status < 0) {
        throw std::runtime_error("Error: on point_add: " + obj->getValue<std::string>("error"));
    }

    return std::make_unique<PointImpl>(obj->getValue<Pson::BinaryString>("buff"));
}

void PointImpl::validate() const {
    if (_point.empty()) {
        //throw CryptoException("Empty Point");
    }
}