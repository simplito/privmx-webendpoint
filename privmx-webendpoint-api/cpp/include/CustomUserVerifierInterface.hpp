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
#include <Poco/Dynamic/Var.h> 

namespace privmx {
namespace webendpoint {

class CustomUserVerifierInterface: public virtual endpoint::core::UserVerifierInterface {
public:
    CustomUserVerifierInterface(int interfaceBindId) : endpoint::core::UserVerifierInterface(), _interfaceBindId(interfaceBindId) {}
    std::vector<bool> verify(const std::vector<endpoint::core::VerificationRequest>& request) override;
private:
    void printErrorInJS(const std::string& msg);
    Poco::Dynamic::Var callVerifierOnJS(const std::string& methodName, const Poco::Dynamic::Var& params);
    void runAsyncTaskOnMain(const std::function<void(void)>& func);
    int _interfaceBindId;
};

class UserVerifierHolder {
    public:
        UserVerifierHolder(int bindId);
        std::shared_ptr<CustomUserVerifierInterface> getInstance();

    private:
        std::shared_ptr<CustomUserVerifierInterface> _verifierInterface;
        int _bindId;
};


} // namespace webendpoint
} // namespace privmx
#endif