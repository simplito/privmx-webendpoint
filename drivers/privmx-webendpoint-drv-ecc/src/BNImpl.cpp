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


using namespace std;

BNImpl::Ptr BNImpl::fromBuffer(const string& data) {
    return std::make_unique<BNImpl>(data);
}

BNImpl::Ptr BNImpl::getDefault() {
    return std::make_unique<BNImpl>();
}

BNImpl::BNImpl(const BNImpl& obj) : _bn(obj._bn) {}

BNImpl::BNImpl(BNImpl&& obj) : _bn(std::move(obj._bn)) {}

BNImpl::BNImpl(const std::string& bn) : _bn(bn) {}

BNImpl& BNImpl::operator=(const BNImpl& obj) {
    _bn = obj._bn;
    return *this;
}

BNImpl& BNImpl::operator=(BNImpl&& obj) {
    _bn = std::move(obj._bn);
    return *this;
}

string BNImpl::toBuffer() const {
    return _bn;
}

std::size_t BNImpl::getBitsLength() const {
    validate();
    emscripten::val name { emscripten::val::u8string("bn_getBitsLength") };
    emscripten::val params { emscripten::val::object() };
    params.set("bn", emscripten::typed_memory_view(_bn.size(), _bn.data())); 

    emscripten::val result = Bindings::callJSRawSync(name, params);
    int status = result["status"].as<int>();
    if (status < 0) {
        auto errorString = result["error"].as<std::string>();
        Bindings::printErrorInJS(errorString);
        throw std::runtime_error("Error: on sign");
    }

    return result["buff"].as<int>();
}

BNImpl::Ptr BNImpl::umod(const BNImpl& bn) const {
    validate();
    emscripten::val name { emscripten::val::u8string("bn_umod") };
    emscripten::val params { emscripten::val::object() };
    params.set("bn", emscripten::typed_memory_view(_bn.size(), _bn.data()));
    auto tmp2 = bn.toBuffer();
    params.set("bn2", emscripten::typed_memory_view(tmp2.size(), tmp2.data())); 

    emscripten::val result = Bindings::callJSRawSync(name, params);
    int status = result["status"].as<int>();
    if (status < 0) {
        auto errorString = result["error"].as<std::string>();
        Bindings::printErrorInJS(errorString);
        throw std::runtime_error("Error: on sign");
    }

    return std::make_unique<BNImpl>(result["buff"].as<std::string>());
}

bool BNImpl::eq(const BNImpl& bn) const {
    validate();
    emscripten::val name { emscripten::val::u8string("bn_eq") };
    emscripten::val params { emscripten::val::object() };
    params.set("bn", emscripten::typed_memory_view(_bn.size(), _bn.data())); 
    auto tmp2 = bn.toBuffer();
    params.set("bn2", emscripten::typed_memory_view(bn.toBuffer().size(), bn.toBuffer().data())); 

    emscripten::val result = Bindings::callJSRawSync(name, params);
    int status = result["status"].as<int>();
    if (status < 0) {
        auto errorString = result["error"].as<std::string>();
        Bindings::printErrorInJS(errorString);
        throw std::runtime_error("Error: on sign");
    }

    return result["buff"].as<bool>();
}

void BNImpl::validate() const {
    if (isEmpty()) {
        //throw CryptoException("Empty BN");
    }
}
