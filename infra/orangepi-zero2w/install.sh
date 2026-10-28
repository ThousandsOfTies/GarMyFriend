#!/bin/sh
set -eu
umask 022
test "$(id -u)" = 0 || { echo 'Run as root.' >&2; exit 1; }
test "$(uname -m)" = aarch64 || { echo 'This installer is for ARM64.' >&2; exit 1; }
test -f /etc/armbian-release
grep -q '^BOARD=orangepizero2w$' /etc/armbian-release
APP=/opt/garmyfriend/app
cd "$APP"
# tar may create unlisted intermediate directories using the caller's umask.
# These directories contain only this root-managed application release.
find application firmware hardware infra shared sources build -type d -exec chmod 0755 {} +
test -x /opt/garmyfriend/node/bin/node
test -x build/device-output
test -x build/gar_rotary_input
/opt/garmyfriend/node/bin/node --version
GAR_HARDWARE_DIR="$APP/hardware/orangepi-zero2w" /opt/garmyfriend/node/bin/node application/hardware.cjs --value spi
getent group gpio >/dev/null || groupadd --system gpio
getent group spi >/dev/null || groupadd --system spi
id garmyfriend >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin garmyfriend
usermod -a -G gpio,spi garmyfriend
runuser -u garmyfriend -- /opt/garmyfriend/node/bin/node --version
runuser -u garmyfriend -- test -x "$APP/build/device-output"
runuser -u garmyfriend -- test -x "$APP/build/gar_rotary_input"
install -d -m 0755 /boot/overlay-user
dtc -@ -I dts -O dtb -o /boot/overlay-user/garmyfriend-spi1.dtbo infra/orangepi-zero2w/garmyfriend-spi1.dts
# Validate references against this board's live tree before changing boot settings.
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
dtc -I fs -O dtb -o "$staging/base.dtb" /sys/firmware/devicetree/base 2>"$staging/dtc.log"
fdtoverlay -i "$staging/base.dtb" -o "$staging/merged.dtb" /boot/overlay-user/garmyfriend-spi1.dtbo
test -f /boot/armbianEnv.txt.garmyfriend.bak || cp -p /boot/armbianEnv.txt /boot/armbianEnv.txt.garmyfriend.bak
python3 - <<'PY'
from pathlib import Path
file = Path('/boot/armbianEnv.txt')
lines = file.read_text().splitlines()
indices = [i for i, line in enumerate(lines) if line.startswith('user_overlays=')]
if len(indices) > 1:
    raise RuntimeError('Duplicate user_overlays entries; inspect boot configuration')
if indices:
    index = indices[0]
    overlays = lines[index].split('=', 1)[1].split()
    if 'garmyfriend-spi1' not in overlays:
        overlays.append('garmyfriend-spi1')
    lines[index] = 'user_overlays=' + ' '.join(overlays)
else:
    lines.append('user_overlays=garmyfriend-spi1')
file.write_text('\n'.join(lines) + '\n')
PY
cat > /etc/udev/rules.d/70-garmyfriend.rules <<'RULES'
SUBSYSTEM=="gpio", KERNEL=="gpiochip1", GROUP="gpio", MODE="0660"
SUBSYSTEM=="spidev", KERNEL=="spidev1.0", GROUP="spi", MODE="0660"
RULES
udevadm control --reload-rules
udevadm trigger --subsystem-match=gpio --sysname-match=gpiochip1
udevadm trigger --subsystem-match=spidev --sysname-match=spidev1.0
install -m 0644 infra/orangepi-zero2w/garmyfriend.service /etc/systemd/system/garmyfriend.service
systemctl daemon-reload
systemctl enable garmyfriend.service
systemctl reset-failed garmyfriend.service
if [ -c /dev/spidev1.0 ]; then
    systemctl restart garmyfriend.service
else
    echo 'Installed. Reboot to enable header SPI1 and start the face application.'
fi
