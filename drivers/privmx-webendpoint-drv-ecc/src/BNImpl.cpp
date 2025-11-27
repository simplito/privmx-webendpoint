/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.
*/

#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#include <emscripten/bind.h>

#include <privmx/drv/BNImpl.hpp>
#include <privmx/drv/Bindings.hpp>

#include <AsyncEngine.hpp>
#include "Mapper.hpp"
#include <Poco/JSON/Object.h>
#include <Pson/BinaryString.hpp>

#include <stdexcept>

using namespace std;
using namespace emscripten;
using namespace privmx::webendpoint;

namespace {
    
    template<typename T>
    T runBnOp(const std::string& method, const Poco::Dynamic::Var& paramsVar) {
        auto future = AsyncEngine::getInstance()->callJsAsync([&](int callId) {
            Poco::Dynamic::Var localParams = paramsVar;
            emscripten::val jsParams = Mapper::map((pson_value*)&localParams);
            performBindingsCall(method, jsParams, callId);
        }, ThreadTarget::Worker);

        Poco::Dynamic::Var resultVar = future.get();
        Poco::JSON::Object::Ptr obj = resultVar.extract<Poco::JSON::Object::Ptr>();
        int status = obj->getValue<int>("status");
        
        if (status < 0) {
            std::string error = obj->getValue<std::string>("error");
            throw std::runtime_error("Error: on " + method + ": " + error);
        }
        return obj->getValue<T>("buff");
    }
}

BNImpl::Ptr BNImpl::fromBuffer(const string& data) { return std::make_unique<BNImpl>(data); }
BNImpl::Ptr BNImpl::getDefault() { return std::make_unique<BNImpl>(); }

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

// --- ASYNC IMPLEMENTATIONS ---

std::size_t BNImpl::getBitsLength() const {
    validate();
    Poco::JSON::Object::Ptr paramsObj = new Poco::JSON::Object();
    paramsObj->set("bn", Pson::BinaryString(_bn));
    return runBnOp<int>("bn_getBitsLength", paramsObj);
}

BNImpl::Ptr BNImpl::umod(const BNImpl& bn) const {
    validate();
    
    Poco::JSON::Object::Ptr paramsObj = new Poco::JSON::Object();
    paramsObj->set("bn", Pson::BinaryString(_bn));
    paramsObj->set("bn2", Pson::BinaryString(bn.toBuffer()));

    std::string resultStr = runBnOp<Pson::BinaryString>("bn_umod", paramsObj);
    return std::make_unique<BNImpl>(resultStr);
}

bool BNImpl::eq(const BNImpl& bn) const {
    validate();
    
    Poco::JSON::Object::Ptr paramsObj = new Poco::JSON::Object();
    paramsObj->set("bn", Pson::BinaryString(_bn));
    paramsObj->set("bn2", Pson::BinaryString(bn.toBuffer()));

    return runBnOp<bool>("bn_eq", paramsObj);
}

void BNImpl::validate() const {
    if (isEmpty()) {
        //throw CryptoException("Empty BN");
    }
}