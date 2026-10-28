#!/bin/sh
set -eu
cd /home/gar/GarMyFriend
mkdir -p build /home/gar/.config/garmyfriend
make -B -C sources/gar-tools/targets/linux-device/runtime/gc9a01-stub CC=gcc BIN=/home/gar/GarMyFriend/build/cuse_spi_gc9a01
make -B -C sources/gar-tools/targets/linux-device/runtime/i2c-stub CC=gcc BIN=/home/gar/GarMyFriend/build/cuse_i2c
g++ -std=c++11 -Wall -Wextra -O2 application/device-output.cpp -o build/device-output
sudo install -m 0644 infra/virtualbox/garmyfriend.service /etc/systemd/system/
sudo install -m 0644 infra/virtualbox/garmyfriend-devices.service /etc/systemd/system/
sudo install -m 0644 infra/virtualbox/garmyfriend-tunnel.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable garmyfriend.service
sudo systemctl restart garmyfriend-devices.service
sudo systemctl restart garmyfriend.service
sudo systemctl --no-pager --full status garmyfriend.service garmyfriend-devices.service
