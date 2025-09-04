#ifndef _PRIVMXLIB_WEBENDPOINT_CUSTOMUSERVERIFIER_HPP_
#define _PRIVMXLIB_WEBENDPOINT_CUSTOMUSERVERIFIER_HPP_

#include <emscripten/val.h>
#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/proxying.h>
#include <emscripten/emscripten.h>
#include "Macros.hpp"
#include "Mapper.hpp"

#include <memory>
#include <future>
#include <privmx/endpoint/core/UserVerifierInterface.hpp>
#include "privmx/endpoint/core/VarDeserializer.hpp"
#include "privmx/endpoint/core/VarSerializer.hpp"

namespace privmx {
namespace webendpoint {

class CustomUserVerifierInterface: public virtual endpoint::core::UserVerifierInterface {
public:
    CustomUserVerifierInterface(int interfaceBindId) : endpoint::core::UserVerifierInterface(), _interfaceBindId(interfaceBindId) {}
    std::vector<bool> verify(const std::vector<endpoint::core::VerificationRequest>& request) override;
private:
    void printErrorInJS(const std::string& msg);
    emscripten::val callVerifierOnJS(emscripten::EM_VAL name, emscripten::EM_VAL params);
    void runTaskAsync(const std::function<void(void)>& func);
    emscripten::val mapToVal(const std::vector<endpoint::core::VerificationRequest>& request);
    int _interfaceBindId;
};

class UserVerifierHolder {
    public:
        std::shared_ptr<CustomUserVerifierInterface> getInstance(int interfaceBindId);

    private:
        std::shared_ptr<CustomUserVerifierInterface> _verifierInterface;
};


} // namespace webendpoint
} // namespace privmx
#endif