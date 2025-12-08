/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#ifndef _PRIVMXLIB_CRYPTO_EMSCRIPTEN_ECCIMPL_HPP_
#define _PRIVMXLIB_CRYPTO_EMSCRIPTEN_ECCIMPL_HPP_
#include <string>
#include <privmx/drv/ECCImpl.hpp>
#include <privmx/drv/BNImpl.hpp>
#include <privmx/drv/PointImpl.hpp>

struct Signature
{
    std::unique_ptr<BNImpl> r;
    std::unique_ptr<BNImpl> s;
};

class ECCImpl
{
public:
    using Ptr = std::unique_ptr<ECCImpl>;
    static ECCImpl::Ptr genPair();
    static ECCImpl::Ptr fromPublicKey(const std::string& public_key);
    static ECCImpl::Ptr fromPrivateKey(const std::string& private_key);
    ECCImpl();
    ECCImpl(const ECCImpl& obj);
    ECCImpl(ECCImpl&& obj);
    ECCImpl(const std::string& privkey, const std::string& pubkey, bool has_priv);
    ECCImpl& operator=(const ECCImpl& obj);
    ECCImpl& operator=(ECCImpl&& obj);
    operator bool() const;
    bool isEmpty() const;
    std::string getPublicKey(bool compact = true) const;
    PointImpl::Ptr getPublicKey2() const;
    std::string getPrivateKey() const;
    BNImpl::Ptr getPrivateKey2() const;
    std::string sign(const std::string& data) const;
    Signature sign2(const std::string& data) const;
    bool verify(const std::string& data, const std::string& signature) const;
    bool verify2(const std::string& data, const Signature& signature) const;
    std::string derive(const ECCImpl& ecc) const;
    static std::string getOrder();
    static BNImpl::Ptr getOrder2();
    PointImpl::Ptr getGenerator() const;
    BNImpl::Ptr getEcOrder() const;
    static PointImpl::Ptr getEcGenerator();
    bool hasPrivate() const { return _has_priv; }

private:
    std::string _privkey;
    std::string _pubkey;
    bool _has_priv = false;
};

inline ECCImpl::operator bool() const {
    return !isEmpty();
}

inline bool ECCImpl::isEmpty() const {
    return _privkey.empty() && _pubkey.empty();
}

#endif // _PRIVMXLIB_CRYPTO_EMSCRIPTEN_ECCIMPL_HPP_
