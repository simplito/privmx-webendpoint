/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#ifndef _PRIVMXLIB_CRYPTO_EMSCRIPTEN_BNIMPl_HPP_
#define _PRIVMXLIB_CRYPTO_EMSCRIPTEN_BNIMPl_HPP_

#include <functional>
#include <memory>
#include <string>

#include <privmx/drv/BNImpl.hpp>

class BNImpl
{
public:
    using Ptr = std::unique_ptr<BNImpl>;

    static BNImpl::Ptr fromBuffer(const std::string& data);
    static BNImpl::Ptr getDefault();
    BNImpl() = default;
    BNImpl(const BNImpl& obj);
    BNImpl(BNImpl&& obj);
    BNImpl(const std::string& bn);
    BNImpl& operator=(const BNImpl& obj);
    BNImpl& operator=(BNImpl&& obj);
    operator bool() const;
    bool isEmpty() const;
    std::string toBuffer() const;
    std::size_t getBitsLength() const;
    BNImpl::Ptr umod(const BNImpl& bn) const;
    bool eq(const BNImpl& bn) const;

private:
    void validate() const;

    std::string _bn;
};

inline BNImpl::operator bool() const {
    return !isEmpty();
}

inline bool BNImpl::isEmpty() const {
    return _bn.empty();
}

#endif // _PRIVMXLIB_CRYPTO_EMSCRIPTEN_BNIMPl_HPP_
