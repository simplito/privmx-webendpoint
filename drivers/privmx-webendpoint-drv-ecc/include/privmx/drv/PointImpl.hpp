/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#ifndef _PRIVMXLIB_CRYPTO_EMSCRIPTEN_POINTIMPL_HPP_
#define _PRIVMXLIB_CRYPTO_EMSCRIPTEN_POINTIMPL_HPP_

#include <string>
#include <privmx/drv/BNImpl.hpp>
#include <privmx/drv/PointImpl.hpp>
#include <secp256k1.h>

class PointImpl
{
public:
    using Ptr = std::unique_ptr<PointImpl>;
    static PointImpl::Ptr fromBuffer(const std::string& data);
    static PointImpl::Ptr getDefault();
    PointImpl() = default;
    PointImpl(const PointImpl& obj);
    PointImpl(PointImpl&& obj);
    PointImpl(const std::string& point);
    PointImpl& operator=(const PointImpl& obj);
    PointImpl& operator=(PointImpl&& obj);
    operator bool() const;
    bool isEmpty() const;
    std::string encode(secp256k1_context* ctx, bool compact = false) const;
    PointImpl::Ptr mul(const BNImpl& bn) const;
    PointImpl::Ptr add(const PointImpl& point) const;

private:
    void validate() const;

    std::string _point;
};

inline PointImpl::operator bool() const {
    return !isEmpty();
}

inline bool PointImpl::isEmpty() const {
    return _point.empty();
}

#endif // _PRIVMXLIB_CRYPTO_EMSCRIPTEN_POINTIMPL_HPP_
