
#include <emscripten/threading.h>
#include <emscripten/proxying.h>
#include "CustomUserVerifierInterface.hpp"
#include "privmx/endpoint/core/VarDeserializer.hpp"
#include "privmx/endpoint/core/VarSerializer.hpp"

using namespace privmx::webendpoint;
using namespace privmx::endpoint;

// emscripten::ProxyingQueue _queue;

// std::thread wsWorker = std::thread([]{
//     emscripten_runtime_keepalive_push();
// });

// void runTaskAsync(const std::function<void(void)>& func){
//     _queue.proxyAsync(wsWorker.native_handle(),[&,func]{
//         func();
//     });
// }

// emscripten_main_runtime_thread_id()



    EM_JS(emscripten::EM_VAL, print_error_main, (const char* msg), {
        console.error(UTF8ToString(msg));
    });

    EM_ASYNC_JS(emscripten::EM_VAL, verifier_caller, (emscripten::EM_VAL name_handle, emscripten::EM_VAL val_handle), {
        console.log("inside verifier caller...", name_handle, val_handle);
        let name = Emval.toValue(name_handle);
        console.log("name", name);
        let params = Emval.toValue(val_handle);
        console.log("params", params);
        let response = {};

        try {
            response = await window.userVierifier_verify(params);
        } catch (error) {
            console.error("Error on userVerifier_verify call from C for", params, error);
            let ret = { status: -1, buff: "", error: error.toString()};
            return Emval.toHandle(ret);
        }
        let ret = {status: 1, buff: response, error: ""};
        console.log({response});
        return Emval.toHandle(ret);
    });

    void testFuncOnMain() {
        std::cerr << "out from main!!" << std::endl;
        auto isMain = emscripten_is_main_browser_thread();
        std::cerr << "Is main browser thread: " << isMain << std::endl;
    }


    void CustomUserVerifierInterface::printErrorInJS(const std::string& msg) {
        print_error_main(msg.c_str());
    }

    emscripten::val CustomUserVerifierInterface::callVerifierOnJS(emscripten::val& name, emscripten::val& params) {
        printErrorInJS("prep name handle..");
        auto name_as_handle = name.as_handle();
        printErrorInJS("prep params handle..");
        auto params_as_handle = params.as_handle();

        auto ret = emscripten::val::take_ownership(verifier_caller(name.as_handle(), params.as_handle()));
        emscripten_sleep(0);
        return ret;
    }

    emscripten::val CustomUserVerifierInterface::callVerifierOnJS(emscripten::EM_VAL name, emscripten::EM_VAL params) {
        auto ret = emscripten::val::take_ownership(verifier_caller(name, params));
        emscripten_sleep(0);
        return ret;
    }

    std::vector<bool> CustomUserVerifierInterface::verify(const std::vector<core::VerificationRequest>& request) {
        std::vector<bool> out;
        std::promise<std::vector<bool>> prms;
        std::future<std::vector<bool>> ftr = prms.get_future();
        
        // runTaskAsync([&, request, out](const std::function<void(const std::vector<bool>)>& callback){
        runTaskAsync([&, request]{
            printErrorInJS("on verify (cpp) v4");
            emscripten::val name = emscripten::val::u8string("userVerifier_verify");
            emscripten::val params = mapToVal2(request);

            auto name_as_handle = name.as_handle();
            auto params_as_handle = params.as_handle();

            emscripten::val jsResult = callVerifierOnJS(name_as_handle, params_as_handle);

            int status = jsResult["status"].as<int>();
            if (status < 0) {
                printErrorInJS("[CustomUserVerifierIntercace.verify()] Error: on verify");
                printErrorInJS("Error status code: " + std::to_string(status));
                throw std::runtime_error("Error: on verify");
            }

            std::vector<bool> res {};
            auto responseSize = request.size();
            for (int i = 0; i < responseSize; ++i) {
                res.push_back(jsResult["buff"][i].as<bool>());
            }
            for (auto el: res) {
                std::cerr << "post call value: " << el << std::endl;
            }
            // callback(res);
            prms.set_value(res);
        }
        // , [&](std::vector<bool> ret) {
        //     for (auto item: ret) {
        //         std::cout << "on callback: " << item << std::endl;
        //     }
        //     std::copy(ret.begin(), ret.end(), back_inserter(out));
        //     return 0;
        // }
        );

        out = ftr.get();
        std::cout << "out size: " << out.size() << std::endl;
        for (auto item: out) {
            std::cout << "Out item: " << item << std::endl;
        }
        return out;
    };

    // void CustomUserVerifierInterface::runTaskAsync(const std::function<void(const std::function<void(const std::vector<bool>)>&)>& func, const std::function<void(const std::vector<bool>)>& callback){
    void CustomUserVerifierInterface::runTaskAsync(const std::function<void(void)>& func){
        pthread_t mainThread = emscripten_main_runtime_thread_id();
        // pthread_t mainT = pthread_self();
        emscripten::ProxyingQueue _queue;
        // _queue.proxyAsync(mainThread, [&,func, callback]{
        _queue.proxyAsync(mainThread, [&,func]{
            // func(callback);
            func();
        });
    }

    emscripten::val CustomUserVerifierInterface::mapToVal(const std::vector<endpoint::core::VerificationRequest>& request) {
        std::cerr << "mapToVal:request" << std::endl;
        auto out = emscripten::val::array();
        for (auto rItem: request) {
            auto outItem = emscripten::val::object();

            outItem.set("contextId", mapToVal(rItem.contextId));
            outItem.set("senderId", mapToVal(rItem.senderId));
            outItem.set("senderPubKey", mapToVal(rItem.senderPubKey));
            outItem.set("date", mapToVal(rItem.date));
            
            emscripten::val bridgeIdentityVal;
            if (rItem.bridgeIdentity.has_value()) {
                auto bridge = rItem.bridgeIdentity.value();

                bridgeIdentityVal = emscripten::val::object();
                bridgeIdentityVal.set("url", mapToVal(bridge.url));
                bridgeIdentityVal.set("pubKey", bridge.pubKey.has_value() ? mapToVal(bridge.pubKey.value()) : emscripten::val::undefined());
                bridgeIdentityVal.set("instanceId", bridge.instanceId.has_value() ? mapToVal(bridge.instanceId.value()) : emscripten::val::undefined());

            } else {
                bridgeIdentityVal = emscripten::val::undefined();
            }
            outItem.set("bridgeIdentity", bridgeIdentityVal);
            
            out.call<int>("push", outItem);
        }
        return out;
    }

    emscripten::val CustomUserVerifierInterface::mapToVal2(const std::vector<endpoint::core::VerificationRequest>& request) {
        core::VarSerializer serializer {core::VarSerializer::Options{.addType=false, .binaryFormat=core::VarSerializer::Options::PSON_BINARYSTRING}};
        Poco::Dynamic::Var serializedRequest {serializer.serialize(request)};
        pson_value* res = (pson_value*)&serializedRequest;
        auto out {Mapper::map(res)};
        return out;
    }

    emscripten::val CustomUserVerifierInterface::mapToVal(const std::string& val) {
        std::cerr << "mapToVal:string -> " << val << std::endl;
        return emscripten::val(val);
    }

    emscripten::val CustomUserVerifierInterface::mapToVal(int64_t val) {
        // return emscripten::val(val);
        std::cerr << "mapToVal:int64_t -> " << val << std::endl;

        return Mapper::convertInt64ToJsSafeInteger(val);
    }

    std::shared_ptr<CustomUserVerifierInterface> UserVerifierHolder::getInstance() {
        if (!_verifierInterface) {
            _verifierInterface = std::make_shared<CustomUserVerifierInterface>();
        }
        return _verifierInterface;
    }
