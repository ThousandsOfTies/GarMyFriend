#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
export GAR_TOOLS_ROOT="$ROOT/sources/gar-tools"
export GAR_BUILD_DIR="$ROOT/build/arm64"
export CC=${CC:-aarch64-linux-gnu-gcc}
export CXX=${CXX:-aarch64-linux-gnu-g++}
sh "$ROOT/sources/gar-my-friend/tools/build-native.sh"
file "$GAR_BUILD_DIR/device-output" "$GAR_BUILD_DIR/gar_rotary_input"
