#!/bin/bash

set -e

SCRIPT_PATH=$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )

"$SCRIPT_PATH/scripts/get_emsdk"
"$SCRIPT_PATH/scripts/build_gmp"
"$SCRIPT_PATH/scripts/build_poco"
"$SCRIPT_PATH/scripts/build_pson"
"$SCRIPT_PATH/scripts/build_webdrivers"
"$SCRIPT_PATH/scripts/build_privmx_core"
"$SCRIPT_PATH/scripts/build_driver_web_context"
"$SCRIPT_PATH/scripts/build_api"
"$SCRIPT_PATH/scripts/install"

echo "============="
echo "BUILD SUCCESS"
