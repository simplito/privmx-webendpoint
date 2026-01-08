#!/bin/bash

# 1. Determine script location
SCRIPT_PATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

# 2. Source configurations
if [ -f "$SCRIPT_PATH/config.sh" ]; then source "$SCRIPT_PATH/config.sh"; fi

if [ -f "$EMSDK_DIR/emsdk_env.sh" ]; then
    source "$EMSDK_DIR/emsdk_env.sh" > /dev/null
else
    echo "❌ Error: Could not find emsdk_env.sh at $EMSDK_DIR"
    exit 1
fi

# 3. Locate Emscripten Internal Headers
SYSROOT="$EMSDK/upstream/emscripten/cache/sysroot"
LIBCXX="$SYSROOT/include/c++/v1"

if [[ ! -d "$LIBCXX" ]]; then
    echo "❌ Error: Emscripten C++ headers not found. Run a build first."
    exit 1
fi

echo "ℹ️  Using Emscripten C++ Lib: $LIBCXX"

# 4. Handle Arguments: Check for --fix
TIDY_ARGS=""
PARALLEL_COUNT="4" # Default to fast parallel execution

if [[ "$1" == "--fix" ]]; then
    echo "⚠️  WARNING: Running in FIX mode. This will modify files."
    echo "   Ensure you have committed your changes first!"
    TIDY_ARGS="-fix"
    PARALLEL_COUNT="1" # Must be sequential for fixing to prevent file corruption
    
    # Optional: -fix-errors tries to fix even if compilation errors occur
    # TIDY_ARGS="-fix-errors" 
fi

# 5. Define Projects
PROJECTS=(
    "async-engine:async-engine/build-emscripten"
    "drivers/privmx-webendpoint-drv-crypto:drivers/privmx-webendpoint-drv-crypto/build-emscripten"
    "drivers/privmx-webendpoint-drv-ecc:drivers/privmx-webendpoint-drv-ecc/build-emscripten"
    "drivers/privmx-webendpoint-drv-net:drivers/privmx-webendpoint-drv-net/build-emscripten"
    "webendpoint-cpp:webendpoint-cpp/build-emscripten"
)

# 6. Lint Loop
for entry in "${PROJECTS[@]}"; do
    SRC_DIR="${entry%%:*}"
    BUILD_DIR="${entry##*:}"
    DB_FILE="$BUILD_DIR/compile_commands.json"

    echo "---------------------------------------------------"
    echo "🔍 Linting project: $SRC_DIR"

    if [[ ! -d "$SRC_DIR" ]]; then echo "❌ Error: Source directory not found: $SRC_DIR"; continue; fi
    if [[ ! -f "$DB_FILE" ]]; then echo "❌ Error: Database not found at $DB_FILE"; continue; fi

    # We use $PARALLEL_COUNT to switch between fast linting (4) and safe fixing (1)
    find "$SRC_DIR" -type f \( -name '*.c' -o -name '*.cpp' \) -print0 | \
        xargs -0 -P "$PARALLEL_COUNT" clang-tidy -p "$BUILD_DIR" $TIDY_ARGS \
        --extra-arg="--target=wasm32-unknown-emscripten" \
        --extra-arg="-std=c++17" \
        --extra-arg="-D__EMSCRIPTEN__" \
        --extra-arg="-D__i386__" \
        --extra-arg="-nostdinc++" \
        --extra-arg="-isystem$LIBCXX" \
        --extra-arg="-isystem$SYSROOT/include/compat" \
        --extra-arg="-isystem$SYSROOT/include"
    
    echo "✅ Finished $SRC_DIR"
done

echo "---------------------------------------------------"
if [[ "$1" == "--fix" ]]; then
    echo "🎉 Auto-fix complete. Please review 'git diff' to verify changes."
else
    echo "🎉 Linting complete."
fi