cmake_minimum_required(VERSION 3.10.2)

project(privmxdrv-ecc)

include(GNUInstallDirs)

add_compile_options(-pthread)

file(GLOB_RECURSE SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp)
add_library(privmxdrvecc ${SOURCES})
target_include_directories(privmxdrvecc PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
set_target_properties(privmxdrvecc PROPERTIES PUBLIC_HEADER ${CMAKE_CURRENT_SOURCE_DIR}/include/privmx/drv/ecc.h)
target_link_libraries(privmxdrvecc)
target_link_libraries(privmxdrvecc embind)
# ---------------------------------------------------------------------------
# Build variant: release (default) or debug
# ---------------------------------------------------------------------------
set(PRIVMX_BUILD_TYPE "release" CACHE STRING "Build variant: release or debug")

if(PRIVMX_BUILD_TYPE STREQUAL "debug")
    message(STATUS "Building privmxdrvecc: DEBUG")
    set(CMAKE_CXX_FLAGS "-std=c++17 -fexceptions -pthread")
    target_compile_options(privmxdrvecc PUBLIC -O0 -g -pthread -DDEBUG)
else()
    message(STATUS "Building privmxdrvecc: RELEASE")
    set(CMAKE_CXX_FLAGS "-std=c++17 -fexceptions -pthread")
    target_compile_options(privmxdrvecc PUBLIC -O3 -pthread)
endif()
target_link_options(privmxdrvecc PUBLIC
    -L $ENV{SDK_DIR}/upstream/emscripten/cache/sysroot/lib
    -sUSE_PTHREADS
    -sEXPORTED_RUNTIME_METHODS=['HEAPU8','ccall']
)
install(TARGETS privmxdrvecc PUBLIC_HEADER DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/privmx/drv)
