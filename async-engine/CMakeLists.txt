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

target_compile_options(asyncengine PUBLIC 
    -O3
    -pthread
    -fexceptions # Ensure exceptions are enabled for async logic
)

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