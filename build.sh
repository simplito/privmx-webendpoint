#!/bin/bash
set -e
SCRIPT_PATH=$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )
source "$SCRIPT_PATH/build-manifest.sh"

"$SCRIPT_PATH/scripts/get_emsdk"
"$SCRIPT_PATH/scripts/build_gmp" $GMP
"$SCRIPT_PATH/scripts/build_poco" $POCO
"$SCRIPT_PATH/scripts/build_pson" $PSON_CPP

"$SCRIPT_PATH/scripts/build_webdrivers"
"$SCRIPT_PATH/scripts/build_privmx_endpoint" $PRIVMX_ENDPOINT
"$SCRIPT_PATH/scripts/build_driver_web_context"
"$SCRIPT_PATH/scripts/build_api" $PRIVMX_ENDPOINT
"$SCRIPT_PATH/scripts/install"

echo "============="
echo "BUILD SUCCESS"
