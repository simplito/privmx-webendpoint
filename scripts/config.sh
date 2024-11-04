#!/bin/bash

BASE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )/.."

EMSDK_VERSION="3.1.45"

SOURCE_DIR="$BASE_DIR/src"
EMSDK_DIR="$BASE_DIR/emsdk"
SCRIPTS_DIR="$BASE_DIR/scripts"
SYSROOT_DIR="$BASE_DIR/emsdk/upstream/emscripten/cache/sysroot"
OUT_DIR="$BASE_DIR/out"

GMP_VERSION="6.2.1"
GMP_DIR="$SOURCE_DIR/gmp-$GMP_VERSION"

POCO_VERSION="1.10.1"
POCO_DIR="$SOURCE_DIR/poco-$POCO_VERSION-all"

PRIVMX_CORE_DIR="$SOURCE_DIR/privmx-core"
PSON_DIR="$SOURCE_DIR/pson-cpp"
PRIVMX_DRV_CRYPTO="$SOURCE_DIR/privmxdrv-crypto-web"
PRIVMX_DRV_ECC="$SOURCE_DIR/privmxdrv-ecc-web"
PRIVMX_DRV_NET="$SOURCE_DIR/privmxdrv-net-web"
DRIVER_WEB_CONTEXT_DIR="$SOURCE_DIR/driver-web-context"
ENDPOINT_WEB_API_DIR="$SOURCE_DIR/endpoint-web-api"
