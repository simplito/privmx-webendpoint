cmake_minimum_required(VERSION 3.10.2)

project(privmxdrv-net)


include(GNUInstallDirs)

file(GLOB_RECURSE SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp)
add_library(privmxdrvnet ${SOURCES})
target_include_directories(privmxdrvnet PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
set_target_properties(privmxdrvnet PROPERTIES PUBLIC_HEADER ${CMAKE_CURRENT_SOURCE_DIR}/include/privmx/drv/net.h)
target_link_libraries(privmxdrvnet PRIVATE embind)
install(TARGETS privmxdrvnet PUBLIC_HEADER DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/privmx/drv)
