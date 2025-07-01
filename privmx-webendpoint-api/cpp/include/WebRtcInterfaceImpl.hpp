/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#ifndef _PRIVMXLIB_ENDPOINTWEB_STREAM_WEBRTCINTERFACEIMPL_HPP_
#define _PRIVMXLIB_ENDPOINTWEB_STREAM_WEBRTCINTERFACEIMPL_HPP_

#include <string>
#include <vector>
#include <functional>
#include <emscripten.h>
#include <emscripten/val.h>


#include <emscripten/bind.h>
#include <emscripten/proxying.h>
#include <emscripten/emscripten.h>
#include "Macros.hpp"
#include "Mapper.hpp"

#include <memory>
#include <future>

#include "privmx/endpoint/stream/WebRTCInterface.hpp"
#include "privmx/endpoint/core/VarDeserializer.hpp"
#include "privmx/endpoint/core/VarSerializer.hpp"
#include "privmx/endpoint/stream/Types.hpp"


namespace privmx {
namespace webendpoint {
namespace stream {

// struct SdpWithTypeModel {
//     std::string sdp;
//     std::string type;
// };

class WebRtcInterfaceImpl : public endpoint::stream::WebRTCInterface
{
public:
    WebRtcInterfaceImpl();
    ~WebRtcInterfaceImpl() = default;
    std::string createOfferAndSetLocalDescription();
    std::string createAnswerAndSetDescriptions(const std::string& sdp, const std::string& type);
    void setAnswerAndSetRemoteDescription(const std::string& sdp, const std::string& type);
    void close();
    void updateKeys(const std::vector<privmx::endpoint::stream::Key>& keys);

private:
    void setRemoteDescription(const std::string& sdp, const std::string& type);


    // copy of verifier methods - to modify
    void printErrorInJS(const std::string& msg);
    emscripten::val callWebRtcJSHandler(emscripten::EM_VAL name, emscripten::EM_VAL params);
    void runTaskAsync(const std::function<void(void)>& func);

    template<typename T>
    emscripten::val mapToVal(const T& value);

    void assertStatus(const std::string& method, const emscripten::val& jsResult);

};

class WebRtcInterfaceHolder {
    public:
        std::shared_ptr<WebRtcInterfaceImpl> getInstance();

    private:
        std::shared_ptr<WebRtcInterfaceImpl> _webRtcInterface;
};

} // namespace stream
} // namespace endpoint
} // namespace privmx

#endif // _PRIVMXLIB_ENDPOINTWEB_STREAM_WEBRTCINTERFACEIMPL_HPP_
