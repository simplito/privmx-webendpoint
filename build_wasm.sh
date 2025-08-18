#!/bin/bash
set -e
SCRIPT_PATH=$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )
source "$SCRIPT_PATH/build-manifest.sh"

sep() {
    echo "=========================== $1 =========================="
}

sep "get_emsdk"
"$SCRIPT_PATH/scripts/get_emsdk"
sep "build_gmp"
"$SCRIPT_PATH/scripts/build_gmp" $GMP
sep "build_poco"
"$SCRIPT_PATH/scripts/build_poco" $POCO
sep "build_pson"
"$SCRIPT_PATH/scripts/build_pson" $PSON_CPP

sep "build_secp"
"$SCRIPT_PATH/scripts/build_secp"

sep "build_webdrivers"
"$SCRIPT_PATH/scripts/build_webdrivers"
sep "build_privmx_endpoint"
"$SCRIPT_PATH/scripts/build_privmx_endpoint" $PRIVMX_ENDPOINT
sep "build_driver_web_context"
"$SCRIPT_PATH/scripts/build_driver_web_context"
sep "build_api"
"$SCRIPT_PATH/scripts/build_api" $PRIVMX_ENDPOINT
sep "add assets to npm"
"$SCRIPT_PATH/scripts/add_assets_to_npm"
echo "BUILD SUCCESS"
