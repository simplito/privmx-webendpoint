cmake_minimum_required(VERSION 3.10.2)

project(privmxdrv-net)


include(GNUInstallDirs)

file(GLOB_RECURSE SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp)
add_library(privmxdrvnet ${SOURCES})
target_include_directories(privmxdrvnet PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
set_target_properties(privmxdrvnet PROPERTIES PUBLIC_HEADER ${CMAKE_CURRENT_SOURCE_DIR}/include/privmx/drv/net.h)
target_link_libraries(privmxdrvnet PRIVATE embind)
# ---------------------------------------------------------------------------
# Build variant: release (default) or debug
# ---------------------------------------------------------------------------
set(PRIVMX_BUILD_TYPE "release" CACHE STRING "Build variant: release or debug")

if(PRIVMX_BUILD_TYPE STREQUAL "debug")
    message(STATUS "Building privmxdrvnet: DEBUG")
    set(CMAKE_CXX_FLAGS "-std=c++17 -fexceptions -pthread")
    target_compile_options(privmxdrvnet PUBLIC -O0 -g -pthread -DDEBUG)
else()
    message(STATUS "Building privmxdrvnet: RELEASE")
    set(CMAKE_CXX_FLAGS "-std=c++17 -fexceptions -pthread")
    target_compile_options(privmxdrvnet PUBLIC -O3 -pthread)
endif()
target_link_options(privmxdrvnet PUBLIC
    -L $ENV{SDK_DIR}/upstream/emscripten/cache/sysroot/lib
    -sUSE_PTHREADS
    -sEXPORTED_RUNTIME_METHODS=['HEAPU8','ccall']
)
install(TARGETS privmxdrvnet PUBLIC_HEADER DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/privmx/drv)
