cmake_minimum_required(VERSION 3.10.2)

project(privmxdrv-net)


include(GNUInstallDirs)

file(GLOB_RECURSE SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp)
add_library(privmxdrvnet ${SOURCES})
target_include_directories(privmxdrvnet PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
set_target_properties(privmxdrvnet PROPERTIES PUBLIC_HEADER ${CMAKE_CURRENT_SOURCE_DIR}/include/privmx/drv/net.h)
target_link_libraries(privmxdrvnet PRIVATE embind)
target_compile_options(privmxdrvnet PUBLIC 
    -O3
    -pthread
)
set(CMAKE_CXX_FLAGS "-std=c++17 -fexceptions -pthread")
target_link_options(privmxdrvnet PUBLIC
    -L $ENV{SDK_DIR}/upstream/emscripten/cache/sysroot/lib
    -sUSE_PTHREADS
    -sEXPORTED_RUNTIME_METHODS=['HEAPU8','ccall']
)
install(TARGETS privmxdrvnet PUBLIC_HEADER DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/privmx/drv)
