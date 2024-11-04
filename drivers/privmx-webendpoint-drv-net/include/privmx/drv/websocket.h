/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#include <emscripten/emscripten.h>

#include <exception>
#include <memory>

#ifdef __cplusplus
extern "C" {
#endif

    extern int wsCreateWebSocket(const char *url);
    extern void wsDeleteWebSocket(int ws);
    extern void wsSetOpenCallback(int ws, void (*onopen)(void *));
    extern void wsSetCloseCallback(int ws, void (*onclose)(void *, int));
    extern void wsSetErrorCallback(int ws, void (*onerror)(void*, const char*, int));
    extern void wsSetMessageCallback(int ws, void (*onmessage)(void*, const char*, int ));
    extern int wsSendMessage(int ws, const char *buffer, int size);
    extern void wsSetUserPointer(int ws, void *ptr);
    
#ifdef __cplusplus
}
#endif

