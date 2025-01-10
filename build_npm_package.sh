#!/bin/bash

set -e

SCRIPT_PATH=$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )

NPM_PACKAGE_VERSION="1.0.0"
if [ -n "$1" ]; then
    NPM_PACKAGE_VERSION="$1"
fi

cd $SCRIPT_PATH/scripts
./prepare_npm "$NPM_PACKAGE_VERSION" "$SCRIPT_PATH"

if [ -z "$1" ]; then
    echo -e "\e[1;33mWarning: The NPM package was built with the auto-generated version number.\e[0m"
    echo -e "\e[1;33mTo set the version number of your choice - run $0 <version>\e[0m"
fi
