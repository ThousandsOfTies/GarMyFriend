#!/bin/sh
set -eu
umask 022
test "$(id -u)" = 0
test "$(uname -m)" = aarch64
archive=${1:?Pass the official node-v24.22.1-linux-arm64.tar.xz archive}
printf '%s  %s\n' dbabf7a1cbf947e6059ffad2c27b80041db97dea1e553b62afdee7f13fca336e "$archive" | sha256sum -c -
install -d -m 0755 /opt/garmyfriend
install -d -m 0755 /opt/garmyfriend/node-v24.22.1-linux-arm64/bin
tar --no-same-owner -xJf "$archive" -C /opt/garmyfriend node-v24.22.1-linux-arm64/bin/node node-v24.22.1-linux-arm64/LICENSE
ln -sfn node-v24.22.1-linux-arm64 /opt/garmyfriend/node
/opt/garmyfriend/node/bin/node --version
