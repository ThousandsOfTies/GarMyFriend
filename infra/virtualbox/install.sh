#!/bin/sh
set -eu
cd /home/gar/GarMyFriend
mkdir -p build /home/gar/.config/garmyfriend
make -B -C sources/gar-tools/targets/linux-device/runtime/gc9a01-stub CC=gcc BIN=/home/gar/GarMyFriend/build/cuse_spi_gc9a01
make -B -C sources/gar-tools/targets/linux-device/runtime/rotary-input CC=gcc BIN=/home/gar/GarMyFriend/build/gar_rotary_input
g++ -std=c++11 -Wall -Wextra -O2 application/device-output.cpp -o build/device-output
sudo install -m 0644 infra/virtualbox/garmyfriend.service /etc/systemd/system/
sudo install -m 0644 infra/virtualbox/garmyfriend-panel.service /etc/systemd/system/
sudo install -m 0644 infra/virtualbox/garmyfriend-devices.service /etc/systemd/system/
sudo install -m 0644 infra/virtualbox/garmyfriend-tunnel.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable garmyfriend.service garmyfriend-panel.service
# Remove obsolete Product modules and the old actuator configuration on upgrades.
rm -f simulation/runtime.cjs simulation/linux-devices.cjs simulation/rotary-input.cjs hardware/i2c.csv build/cuse_i2c
sudo systemctl restart garmyfriend-devices.service
sudo systemctl restart garmyfriend.service
sudo systemctl restart garmyfriend-panel.service
sudo systemctl --no-pager --full status garmyfriend.service garmyfriend-panel.service garmyfriend-devices.service
