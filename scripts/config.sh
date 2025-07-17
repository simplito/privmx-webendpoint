#!/bin/bash

BASE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )/.."

EMSDK_VERSION="3.1.45"
# EMSDK_VERSION="4.0.11"

EMSDK_DIR="$BASE_DIR/emsdk"
SCRIPTS_DIR="$BASE_DIR/scripts"
SYSROOT_DIR="$BASE_DIR/emsdk/upstream/emscripten/cache/sysroot"

SOURCE_DIR="$BASE_DIR/src"
DRIVERS_DIR="$BASE_DIR/drivers"

OUT_DIR="$BASE_DIR/out"

# GMP_VERSION="6.2.1"


# POCO_VERSION="1.10.1"
# POCO_DIR="$SOURCE_DIR/poco-$POCO_VERSION-all"

# PRIVMX_CORE_DIR="$SOURCE_DIR/privmx-core"
# PSON_DIR="$SOURCE_DIR/pson-cpp"
# PRIVMX_DRV_CRYPTO="$SOURCE_DIR/privmxdrv-crypto-web"
# PRIVMX_DRV_ECC="$SOURCE_DIR/privmxdrv-ecc-web"
# PRIVMX_DRV_NET="$SOURCE_DIR/privmxdrv-net-web"
# DRIVER_WEB_CONTEXT_DIR="$SOURCE_DIR/driver-web-context"
# ENDPOINT_WEB_API_DIR="$SOURCE_DIR/endpoint-web-api"




PRIVMX_ENDPOINT_SRC="$SOURCE_DIR/privmx-endpoint"
PSON_CPP_SRC="$SOURCE_DIR/pson-cpp"

PRIVMX_WEBENDPOINT_API_SRC="$BASE_DIR/privmx-webendpoint-api"
PRIVMX_WEBENDPOINT_DRV_ECC_SRC="$DRIVERS_DIR/privmx-webendpoint-drv-ecc"
PRIVMX_WEBENDPOINT_DRV_NET_SRC="$DRIVERS_DIR/privmx-webendpoint-drv-net"
PRIVMX_WEBENDPOINT_DRV_CRYPTO_SRC="$DRIVERS_DIR/privmx-webendpoint-drv-crypto"
PRIVMX_WEBENDPOINT_DRV_CONTEXT_SRC="$DRIVERS_DIR/privmx-webendpoint-drv-context"

NPM_ASSETS_DIR="$PRIVMX_WEBENDPOINT_API_SRC/ts/assets"