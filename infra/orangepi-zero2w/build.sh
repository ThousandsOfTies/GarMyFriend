#!/bin/sh
# Run on ARM64 with CC=gcc CXX=g++, or cross-build on the development VM.
set -eu
cd "$(dirname "$0")/../.."
CC=${CC:-aarch64-linux-gnu-gcc}
CXX=${CXX:-aarch64-linux-gnu-g++}
mkdir -p build/arm64
"$CXX" -std=c++11 -Wall -Wextra -Werror -O2 application/device-output.cpp -o build/arm64/device-output
"$CC" -std=c11 -Wall -Wextra -Werror -O2 sources/gar-tools/targets/linux-device/runtime/rotary-input/rotary_input.c -o build/arm64/gar_rotary_input
file build/arm64/device-output build/arm64/gar_rotary_input
