/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.
*/

#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#include <emscripten/bind.h> // For typed_memory_view

#include <privmx/drv/BNImpl.hpp>
#include <privmx/drv/Bindings.hpp>
#include <privmx/drv/ECCImpl.hpp>
#include <privmx/drv/PointImpl.hpp>

// Async Engine & Mapper
#include <AsyncEngine.hpp>
#include "Mapper.hpp"
#include <Poco/JSON/Object.h>
#include <Pson/BinaryString.hpp>

#include <iostream>
#include <stdexcept>

using namespace std;
using namespace emscripten;
using namespace privmx::webendpoint;

namespace {
    
    template<typename T>
    T runEccOp(const std::string& method, const Poco::Dynamic::Var& paramsVar) {
            auto future = AsyncEngine::getInstance()->callJsAsync([&](int callId) {
            Poco::Dynamic::Var localParams = paramsVar;
            emscripten::val jsParams = Mapper::map((pson_value*)&localParams);        
            performBindingsCall(method, jsParams, callId);
        }, ThreadTarget::Worker);

        Poco::Dynamic::Var resultVar = future.get();
        
        Poco::JSON::Object::Ptr obj = resultVar.extract<Poco::JSON::Object::Ptr>();
        int status = obj->getValue<int>("status");
        
        if (status < 0) {
            std::string error = obj->getValue<Pson::BinaryString>("error");
            throw std::runtime_error("Error: on " + method + ": " + error);
        }

        return obj->getValue<T>("buff");
    }

    Poco::JSON::Object::Ptr runEccOpObj(const std::string& method, const Poco::Dynamic::Var& paramsVar) {
        
        auto future = AsyncEngine::getInstance()->callJsAsync([&](int callId) {
            Poco::Dynamic::Var localParams = paramsVar;
            emscripten::val jsParams = Mapper::map((pson_value*)&localParams);
            performBindingsCall(method, jsParams, callId);
        }, ThreadTarget::Worker);

        Poco::Dynamic::Var resultVar = future.get();
        Poco::JSON::Object::Ptr obj = resultVar.extract<Poco::JSON::Object::Ptr>();
        
        if (obj->getValue<int>("status") < 0) {
            throw std::runtime_error("Error: on " + method + ": " + obj->getValue<Pson::BinaryString>("error"));
        }
        
        return obj->getObject("buff");
    }
}


ECCImpl::ECCImpl() {}
ECCImpl::ECCImpl(const ECCImpl& obj) : _privkey(obj._privkey), _pubkey(obj._pubkey), _has_priv(obj._has_priv) {}
ECCImpl::ECCImpl(ECCImpl&& obj) : _privkey(std::move(obj._privkey)), _pubkey(obj._pubkey), _has_priv(std::move(obj._has_priv)) {}
ECCImpl::ECCImpl(const std::string& privkey, const std::string& pubkey, bool has_priv)
        : _privkey(privkey), _pubkey(pubkey), _has_priv(has_priv) {}

ECCImpl& ECCImpl::operator=(const ECCImpl& obj) {
    _has_priv = obj._has_priv;
    _privkey = obj._privkey;
    _pubkey = obj._pubkey;
    return *this;
}

ECCImpl& ECCImpl::operator=(ECCImpl&& obj) {
    _has_priv = std::move(obj._has_priv);
    _privkey = std::move(obj._privkey);
    _pubkey = std::move(obj._pubkey);
    return *this;
}

string ECCImpl::getPublicKey(bool compact) const { return _pubkey; }
PointImpl::Ptr ECCImpl::getPublicKey2() const { return std::make_unique<PointImpl>(_pubkey); }
string ECCImpl::getPrivateKey() const { 
    return _privkey; 
}
BNImpl::Ptr ECCImpl::getPrivateKey2() const { return std::make_unique<BNImpl>(_privkey); }


// --- ASYNC IMPLEMENTATIONS ---

ECCImpl::Ptr ECCImpl::genPair() {
    Poco::Dynamic::Var params; // Null/Empty

    Poco::JSON::Object::Ptr result = runEccOpObj("ecc_genPair", params);

    std::string priv_key = result->getValue<Pson::BinaryString>("privateKey");
    std::string pub_key = result->getValue<Pson::BinaryString>("publicKey");

    return std::make_unique<ECCImpl>(priv_key, pub_key, true);
}

ECCImpl::Ptr ECCImpl::fromPublicKey(const string& public_key) {
    Poco::JSON::Object::Ptr params = new Poco::JSON::Object();
    params->set("key", Pson::BinaryString(public_key));

    Poco::JSON::Object::Ptr result = runEccOpObj("ecc_fromPublicKey", params);
    std::string pub_key = result->getValue<Pson::BinaryString>("publicKey");

    return std::make_unique<ECCImpl>(std::string(), pub_key, false);
}

ECCImpl::Ptr ECCImpl::fromPrivateKey(const std::string& private_key) {
    Poco::JSON::Object::Ptr params = new Poco::JSON::Object();
    params->set("key", Pson::BinaryString(private_key));

    Poco::JSON::Object::Ptr result = runEccOpObj("ecc_fromPrivateKey", params);
    
    std::string priv_key = result->getValue<Pson::BinaryString>("privateKey");
    std::string pub_key = result->getValue<Pson::BinaryString>("publicKey");

    return std::make_unique<ECCImpl>(priv_key, pub_key, true);
}

string ECCImpl::sign(const string& data) const {
    Poco::JSON::Object::Ptr params = new Poco::JSON::Object();
    params->set("privateKey", Pson::BinaryString(_privkey));
    params->set("data", Pson::BinaryString(data));

    return runEccOp<Pson::BinaryString>("ecc_sign", params);
}

Signature ECCImpl::sign2(const string& data) const {
    std::string sig = sign(data);
    if(sig.size() < 65) throw std::runtime_error("Signature too short");
    std::string r = sig.substr(1, 32);
    std::string s = sig.substr(33, 32);
    return {.r = std::make_unique<BNImpl>(r), .s = std::make_unique<BNImpl>(s)};
}

bool ECCImpl::verify(const std::string& data, const std::string& signature) const {
    Poco::JSON::Object::Ptr params = new Poco::JSON::Object();
    params->set("publicKey", Pson::BinaryString(_pubkey));
    params->set("data", Pson::BinaryString(data));
    params->set("signature", Pson::BinaryString(signature));

    return runEccOp<bool>("ecc_verify", params);
}

bool ECCImpl::verify2(const std::string& data, const Signature& signature) const {
    Poco::JSON::Object::Ptr params = new Poco::JSON::Object();
    params->set("data", Pson::BinaryString(data));
    
    params->set("r", Pson::BinaryString(signature.r->toBuffer()));
    params->set("s", Pson::BinaryString(signature.s->toBuffer()));
    return runEccOp<bool>("ecc_verify2", params);
}

string ECCImpl::derive(const ECCImpl& ecc) const {
    Poco::JSON::Object::Ptr params = new Poco::JSON::Object();
    params->set("privateKey", Pson::BinaryString(_privkey));
    params->set("publicKey", Pson::BinaryString(ecc._pubkey));
    
    return runEccOp<Pson::BinaryString>("ecc_derive", params);
}

std::string ECCImpl::getOrder() { 
    Poco::Dynamic::Var params; // Null
    return runEccOp<Pson::BinaryString>("ecc_getOrder", params);
}

BNImpl::Ptr ECCImpl::getOrder2() {
    std::string n = getOrder(); // OK: static calling static
    return std::make_unique<BNImpl>(n);
}

PointImpl::Ptr ECCImpl::getGenerator() const {
    Poco::Dynamic::Var params; // Null
    std::string g = runEccOp<Pson::BinaryString>("ecc_getGenerator", params);
    return std::make_unique<PointImpl>(g);
}

BNImpl::Ptr ECCImpl::getEcOrder() const {
    return std::make_unique<BNImpl>(getOrder());
}

PointImpl::Ptr ECCImpl::getEcGenerator() {
    // Same as getGenerator
    Poco::Dynamic::Var params;
    std::string g = runEccOp<Pson::BinaryString>("ecc_getGenerator", params);
    return std::make_unique<PointImpl>(g);
}