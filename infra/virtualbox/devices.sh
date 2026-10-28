#!/bin/sh
set -eu
APP=/home/gar/GarMyFriend
RUNTIME="$APP/sources/gar-tools/targets/linux-device/runtime"
modprobe cuse
modprobe gpio-sim
mountpoint -q /sys/kernel/config || mount -t configfs none /sys/kernel/config
CHIP=/sys/kernel/config/gpio-sim/garmyfriend
if [ ! -d "$CHIP" ]; then
  mkdir "$CHIP" "$CHIP/gpio-bank0"
  echo 32 > "$CHIP/gpio-bank0/num_lines"
  echo garmyfriend > "$CHIP/gpio-bank0/label"
  echo 1 > "$CHIP/live"
fi
test -c /dev/gpiochip0
test "$(cat "$CHIP/gpio-bank0/chip_name")" = gpiochip0
install -d -o gar -g gar -m 0750 /run/gar-myfriend
export GAR_HW_SIM_SOCK=/run/gar-myfriend/hw_sim.sock
export GAR_HARDWARE_DIR="$APP/hardware"
export GAR_RUNTIME_DIR=/run/gar-myfriend
export GAR_BRIDGE_HOST=127.0.0.1
export GAR_BRIDGE_PORT=8080
pids=""
cleanup() { for pid in $pids; do kill "$pid" 2>/dev/null || true; done; wait || true; }
trap cleanup EXIT INT TERM
python3 -B "$RUNTIME/web-bridge/bridge.py" & pids="$pids $!"
attempt=0
while [ ! -S "$GAR_HW_SIM_SOCK" ]; do
  attempt=$((attempt+1)); [ "$attempt" -lt 100 ] || exit 1; sleep 0.1
done
"$APP/build/cuse_spi_gc9a01" -f -s --devname=spidev0.0 --dc-line=16 & pids="$pids $!"
"$APP/build/cuse_i2c" -f -s --devname=i2c-1 & pids="$pids $!"
attempt=0
while [ ! -c /dev/spidev0.0 ] || [ ! -c /dev/i2c-1 ]; do
  attempt=$((attempt+1)); [ "$attempt" -lt 100 ] || exit 1; sleep 0.1
done
chgrp gar /dev/gpiochip0 /dev/spidev0.0 /dev/i2c-1
chmod 0660 /dev/gpiochip0 /dev/spidev0.0 /dev/i2c-1
systemd-notify --ready
while :; do
  for pid in $pids; do kill -0 "$pid" 2>/dev/null || exit 1; done
  sleep 1
done
