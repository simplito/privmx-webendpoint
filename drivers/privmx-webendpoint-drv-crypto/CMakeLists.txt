cmake_minimum_required(VERSION 3.10.2)

project(privmxdrv-crypto)

include(GNUInstallDirs)

add_compile_options(-pthread)

file(GLOB_RECURSE SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp)
add_library(privmxdrvcrypto ${SOURCES})
target_include_directories(privmxdrvcrypto PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
set_target_properties(privmxdrvcrypto PROPERTIES PUBLIC_HEADER ${CMAKE_CURRENT_SOURCE_DIR}/include/privmx/drv/crypto.h)
target_link_libraries(privmxdrvcrypto embind)
target_compile_options(privmxdrvcrypto PUBLIC 
    -O3
    -pthread
)
set(CMAKE_CXX_FLAGS "-std=c++17 -fexceptions -pthread")
target_link_options(privmxdrvcrypto PUBLIC
    -sUSE_PTHREADS
    -sEXPORTED_RUNTIME_METHODS=['HEAPU8','ccall']
)
install(TARGETS privmxdrvcrypto PUBLIC_HEADER DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/privmx/drv)
