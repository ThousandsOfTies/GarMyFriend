"""Read-only checks for the verified H618 controller and Product CSV profile."""
import csv
import fcntl
import os
from pathlib import Path
import stat
import struct
import time


def check(directory):
    with (directory / 'gpio.csv').open(newline='') as stream:
        gpio = list(csv.DictReader(stream))
    with (directory / 'spi.csv').open(newline='') as stream:
        spi = next(row for row in csv.DictReader(stream) if row['name'] == 'display')
    chips = {row['chip'] for row in gpio}
    if len(chips) != 1:
        raise RuntimeError('This board profile requires the main H618 GPIO controller')
    chip = chips.pop()
    for device in (chip, spi['dev']):
        deadline = time.monotonic() + 15
        while not Path(device).exists() and time.monotonic() < deadline:
            time.sleep(0.2)
        if not stat.S_ISCHR(os.stat(device).st_mode):
            raise RuntimeError(f'Expected a character device: {device}')
    fd = os.open(chip, os.O_RDONLY)
    try:
        info = bytearray(68)
        fcntl.ioctl(fd, 0x8044B401, info)  # GPIO_GET_CHIPINFO_IOCTL
    finally:
        os.close(fd)
    _, label, lines = struct.unpack('32s32sI', info)
    if label.rstrip(b'\0') != b'300b000.pinctrl' or lines != 288:
        raise RuntimeError('GPIO chip identity changed; recheck the physical CSV profile')
    if '5011000.spi' not in str(Path('/sys/class/spidev', Path(spi['dev']).name, 'device').resolve()):
        raise RuntimeError('SPI device is not the header SPI1 controller')
    print(f'Hardware ready: {chip} (300b000.pinctrl), {spi["dev"]}', flush=True)


if __name__ == '__main__':
    check(Path(os.environ['GAR_HARDWARE_DIR']))
