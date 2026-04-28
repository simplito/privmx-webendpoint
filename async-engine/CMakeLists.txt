cmake_minimum_required(VERSION 3.10.2)

project(async-engine)

include(GNUInstallDirs)

# --- THE FIX: ENFORCE C++17 GLOBALLY ---
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
# ---------------------------------------

add_compile_options(-pthread)

file(GLOB_RECURSE SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp)

# Use STATIC to match previous fix recommendations
add_library(asyncengine STATIC ${SOURCES})

# Correct include directories for build vs install
target_include_directories(asyncengine PUBLIC 
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
)

find_package(Threads REQUIRED)
find_package(Poco REQUIRED COMPONENTS Foundation JSON)

target_link_libraries(asyncengine 
    embind 
Threads::Threads 
    Poco::Foundation 
    Poco::JSON 
    Pson
)

# ---------------------------------------------------------------------------
# Build variant: release (default) or debug
# ---------------------------------------------------------------------------
set(PRIVMX_BUILD_TYPE "release" CACHE STRING "Build variant: release or debug")

if(PRIVMX_BUILD_TYPE STREQUAL "debug")
    message(STATUS "Building asyncengine: DEBUG")
    target_compile_options(asyncengine PUBLIC
        -O0 -g
        -pthread
        -fexceptions
        -DDEBUG
    )
else()
    message(STATUS "Building asyncengine: RELEASE")
    target_compile_options(asyncengine PUBLIC
        -O3
        -pthread
        -fexceptions
    )
endif()

target_link_options(asyncengine PUBLIC
    -L $ENV{SDK_DIR}/upstream/emscripten/cache/sysroot/lib
    -sUSE_PTHREADS=1
    -sEXPORTED_RUNTIME_METHODS=['HEAPU8','ccall']
)

# Install Rules
install(TARGETS asyncengine
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
)

install(DIRECTORY include/
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
)