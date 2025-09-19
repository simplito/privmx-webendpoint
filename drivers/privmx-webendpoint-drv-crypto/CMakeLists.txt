cmake_minimum_required(VERSION 3.10.2)

project(privmxdrv-crypto)

include(GNUInstallDirs)

add_compile_options(-pthread)

file(GLOB_RECURSE SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp)
add_library(privmxdrvcrypto ${SOURCES})
target_include_directories(privmxdrvcrypto PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
set_target_properties(privmxdrvcrypto PROPERTIES PUBLIC_HEADER ${CMAKE_CURRENT_SOURCE_DIR}/include/privmx/drv/crypto.h)
target_link_libraries(privmxdrvcrypto embind)
install(TARGETS privmxdrvcrypto PUBLIC_HEADER DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/privmx/drv)
