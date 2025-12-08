project(endpoint-wasm-module)
cmake_minimum_required(VERSION 3.18)
set(CMAKE_CXX_STANDARD 17)
file(GLOB_RECURSE SRC_FILES ${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp)
add_executable(endpoint-wasm-module main.cpp ${SRC_FILES})
target_include_directories(endpoint-wasm-module PUBLIC ${PROJECT_SOURCE_DIR}/include)
find_package(Threads REQUIRED)
find_package(Poco REQUIRED COMPONENTS Foundation JSON)
target_link_libraries(endpoint-wasm-module secp256k1 Threads::Threads Poco::Foundation Poco::JSON Pson gmp privmx privmxendpointcore privmxendpointcrypto privmxendpointthread privmxendpointstore privmxendpointinbox privmxendpointkvdb privmxendpointevent embind privmxdrvcrypto privmxdrvecc privmxdrvnet asyncengine)
set(CMAKE_CXX_FLAGS "-std=c++17 -fexceptions -pthread -flto")
target_compile_options(endpoint-wasm-module PUBLIC 
    -O3
)
target_link_options(endpoint-wasm-module PUBLIC
    -L $ENV{SDK_DIR}/upstream/emscripten/cache/sysroot/lib
    -flto                
    -sUSE_PTHREADS
    -sASSERTIONS=0 -sEXPORT_EXCEPTION_HANDLING_HELPERS -sLLD_REPORT_UNDEFINED
    -sNO_EXIT_RUNTIME -sWASM=1 -sMODULARIZE -sEXPORT_NAME=endpointWasmModule
    -sALLOW_BLOCKING_ON_MAIN_THREAD=0
    -sALLOW_MEMORY_GROWTH=0
    -sPTHREAD_POOL_SIZE_STRICT=0
    -sTEXTDECODER=1
    -sENVIRONMENT=web
    -sINITIAL_MEMORY=260046848
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['HEAPU8','ccall']"
    "SHELL:--js-library=${PROJECT_SOURCE_DIR}/js/websocket.js"
    "SHELL:--pre-js=${PROJECT_SOURCE_DIR}/js/loader.js"
    "SHELL:--extern-post-js=${PROJECT_SOURCE_DIR}/js/extern-post.js"
)
