"""Create only GarMyFriend's dedicated Linux simulation VM; requires pycdlib."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[2]
VM_NAME = 'gar-myfriend-sim'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-image', type=Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--vbox', default=str(Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Oracle/VirtualBox/VBoxManage.exe'))
    args = parser.parse_args()
    import pycdlib
    state = ROOT / '.gar/vm'
    state.mkdir(parents=True, exist_ok=True)
    def vbox(*arguments):
        return subprocess.run([args.vbox, *map(str, arguments)], check=True, text=True, encoding='utf-8', errors='replace', capture_output=True).stdout
    if VM_NAME in vbox('list', 'vms'):
        raise SystemExit('GarMyFriend VM already exists; use npm run vm:start.')
    digest = hashlib.file_digest(args.base_image.open('rb'), 'sha256').hexdigest()
    if digest != args.sha256.lower():
        raise SystemExit('Base image SHA256 mismatch; nothing was changed.')
    private_key = state / 'id_ed25519'
    if not private_key.exists():
        subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', VM_NAME, '-f', str(private_key)], check=True)
    disk = state / 'system.vdi'
    if not disk.exists():
        source_copy = state / 'noble-base.vmdk'
        if not source_copy.exists():
            shutil.copyfile(args.base_image, source_copy)
            vbox('internalcommands', 'sethduuid', source_copy)
        print('Creating a private virtual disk...', flush=True)
        vbox('clonemedium', 'disk', source_copy, disk, '--format', 'VDI')
    vbox('modifymedium', 'disk', disk, '--resize', '16384')
    public_key = private_key.with_suffix('.pub').read_text().strip()
    user_data = f'''#cloud-config
hostname: {VM_NAME}
manage_etc_hosts: true
users:
  - name: gar
    groups: [adm, sudo]
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    lock_passwd: true
    ssh_authorized_keys:
      - {public_key}
ssh_pwauth: false
disable_root: true
package_update: true
packages:
  - nodejs
  - curl
  - ca-certificates
  - openssh-server
  - build-essential
  - libfuse3-dev
  - python3-aiohttp
runcmd:
  - [sh, -c, 'DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "linux-modules-extra-$(uname -r)"']
  - [systemctl, enable, --now, ssh]
'''
    iso = pycdlib.PyCdlib()
    iso.new(interchange_level=3, joliet=3, rock_ridge='1.09', vol_ident='cidata')
    metadata = f'instance-id: garmyfriend-{uuid.uuid4()}\nlocal-hostname: {VM_NAME}\n'
    for name, content in {'user-data': user_data, 'meta-data': metadata}.items():
        data = content.encode()
        iso.add_fp(io.BytesIO(data), len(data), iso_path='/' + name.upper().replace('-', '_') + ';1', rr_name=name, joliet_path='/' + name)
    iso_path = state / 'seed.iso'
    iso.write(str(iso_path)); iso.close()
    vbox('createvm', '--name', VM_NAME, '--ostype', 'Ubuntu_64', '--basefolder', state, '--register')
    vbox('modifyvm', VM_NAME, '--memory', '1024', '--cpus', '1', '--nic1', 'nat', '--natpf1', 'ssh,tcp,127.0.0.1,2231,,22', '--boot1', 'disk', '--boot2', 'dvd', '--boot3', 'none', '--boot4', 'none', '--uart1', '0x3F8', '4', '--uartmode1', 'file', state / 'serial.log')
    vbox('storagectl', VM_NAME, '--name', 'SATA', '--add', 'sata', '--controller', 'IntelAhci', '--portcount', '2')
    vbox('storageattach', VM_NAME, '--storagectl', 'SATA', '--port', '0', '--device', '0', '--type', 'hdd', '--medium', disk)
    vbox('storageattach', VM_NAME, '--storagectl', 'SATA', '--port', '1', '--device', '0', '--type', 'dvddrive', '--medium', iso_path)
    (state / 'vm.json').write_text(json.dumps({'name': VM_NAME, 'sshPort': 2231, 'user': 'gar', 'memoryMiB': 1024, 'cpus': 1, 'architecture': 'x86_64', 'baseSha256': digest}, indent=2) + '\n')
    print(vbox('startvm', VM_NAME, '--type', 'headless'))
    print('VM created. Initial package setup runs in the background.')

if __name__ == '__main__':
    main()
