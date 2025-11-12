project(endpoint-wasm-module)
cmake_minimum_required(VERSION 3.18)
set(CMAKE_CXX_STANDARD 17)
file(GLOB_RECURSE SRC_FILES ${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp)
add_executable(endpoint-wasm-module main.cpp ${SRC_FILES})
target_include_directories(endpoint-wasm-module PUBLIC ${PROJECT_SOURCE_DIR}/include)
find_package(Threads REQUIRED)
find_package(Poco REQUIRED COMPONENTS Foundation JSON)
target_link_libraries(endpoint-wasm-module Threads::Threads Poco::Foundation Poco::JSON Pson gmp privmx privmxendpointcore privmxendpointcrypto privmxendpointthread privmxendpointstore privmxendpointinbox privmxendpointkvdb privmxendpointevent embind privmxdrvcrypto privmxdrvecc privmxdrvnet privmxendpointstream)
set(CMAKE_CXX_FLAGS "-std=c++17 -fexceptions -pthread")
target_link_options(endpoint-wasm-module PUBLIC
    -L $ENV{SDK_DIR}/upstream/emscripten/cache/sysroot/lib
    -sASSERTIONS=2 -sEXPORT_EXCEPTION_HANDLING_HELPERS -sLLD_REPORT_UNDEFINED -sUSE_PTHREADS -sSAFE_HEAP=1
    -sASYNCIFY -sNO_EXIT_RUNTIME -sWASM=1 -sMODULARIZE -sEXPORT_NAME=endpointWasmModule
    -sALLOW_MEMORY_GROWTH=1 -sALLOW_BLOCKING_ON_MAIN_THREAD=0 -sPTHREAD_POOL_SIZE=0
    -sPTHREAD_POOL_SIZE_STRICT=0
    -sTEXTDECODER=0
    -sINITIAL_MEMORY=260046848 # 128MB + 12 * 10MB
    -sASYNCIFY_STACK_SIZE=10485760 # 10MB
    -sEXPORTED_RUNTIME_METHODS=HEAPU8
    "SHELL:--js-library=${PROJECT_SOURCE_DIR}/js/websocket.js"
    "SHELL:--pre-js=${PROJECT_SOURCE_DIR}/js/loader.js"
    "SHELL:--extern-post-js=${PROJECT_SOURCE_DIR}/js/extern-post.js"
)
