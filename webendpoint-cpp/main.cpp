#include <AsyncEngine.hpp>
#include <privmx/endpoint/core/CoreException.hpp>
#include <Poco/JSON/Object.h>

int main() {
    auto engine = privmx::webendpoint::AsyncEngine::getInstance();
    engine->setErrorHandler([](std::exception_ptr eptr, Poco::JSON::Object::Ptr& json) {
        try {
            if (eptr) std::rethrow_exception(eptr);
        }
        catch (const privmx::endpoint::core::Exception& e) {
            json->set("code", (int64_t)e.getCode());
            json->set("name", e.getName());
            json->set("scope", e.getScope());
            json->set("description", e.getDescription());
            json->set("full", e.getFull());
        }
        catch (const std::exception& e) {
            json->set("error", e.what());
        }
    });
    return 0;
}
