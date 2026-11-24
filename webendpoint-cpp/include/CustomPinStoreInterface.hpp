#ifndef _PRIVMXLIB_WEBENDPOINT_CUSTOMPINSTORE_HPP_
#define _PRIVMXLIB_WEBENDPOINT_CUSTOMPINSTORE_HPP_

#include <Poco/Dynamic/Var.h>

#include <privmx/endpoint/core/PinStoreInterface.hpp>
#include <string>
#include <vector>

namespace privmx {
namespace webendpoint {

// A PinStoreInterface kept by JavaScript: `window.pinStoreBinder[bindId]` with `load(key)` and
// `save(key, blob, expected)`, both returning promises. Blobs cross as base64 strings.
// The calls block a worker thread until the main thread's promise settles; a rejection throws.
class CustomPinStoreInterface : public endpoint::core::PinStoreInterface {
public:
    explicit CustomPinStoreInterface(int bindId) : _bindId(bindId) {}
    endpoint::core::Buffer load(const std::string& key) override;
    bool save(const std::string& key, const endpoint::core::Buffer& blob,
              const endpoint::core::Buffer& expected) override;

private:
    Poco::Dynamic::Var call(const std::string& method, const std::vector<std::string>& args);
    int _bindId;
};

}  // namespace webendpoint
}  // namespace privmx
#endif
