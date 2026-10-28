"""GarMyFriend's VirtualBox development lifecycle. No physical-board access."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import time
import urllib.request
import webbrowser

ROOT=Path(__file__).resolve().parents[1]
STATE=ROOT/'.gar/vm'
NAME='gar-myfriend-sim'
VBOX=Path(os.environ.get('ProgramFiles','C:/Program Files'))/'Oracle/VirtualBox/VBoxManage.exe'
SSH=['ssh','-i',str(STATE/'id_ed25519'),'-p','2231','-o','BatchMode=yes','-o','ConnectTimeout=7','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=accept-new','-o',f'UserKnownHostsFile={STATE / "known_hosts"}','gar@127.0.0.1']
TUNNEL_URL='https://github.com/cloudflare/cloudflared/releases/download/2026.10.5/cloudflared-linux-amd64'
TUNNEL_SHA='e1bc0cf084fd9e590554fe769a86b1db46701c3f847a43d902f7b974a4e16298'

def run(args,*,capture=False,check=True):
    return subprocess.run(list(map(str,args)),cwd=ROOT,check=check,text=True,encoding='utf-8',errors='replace',capture_output=capture)

def ssh(command,capture=False):
    return run([*SSH,command],capture=capture).stdout

def scp(source,destination):
    run(['scp','-i',STATE/'id_ed25519','-P','2231','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o',f'UserKnownHostsFile={STATE / "known_hosts"}',source,'gar@127.0.0.1:'+destination])

def archive():
    STATE.mkdir(parents=True,exist_ok=True)
    items=['application','simulation','firmware','shared/expressions.json','preview/face.js','preview/presets.js','simulator','config','hardware','infra','tests/vm-devices.py','sources/gar-tools/targets/linux-device/runtime','sources/gar-tools/web-simulator/components','sources/gar-tools/web-simulator/tests','sources/gar-tools/web-simulator/serve.py']
    def keep(info):
        parts=Path(info.name).parts
        if '.git' in parts or '__pycache__' in parts or 'node_modules' in parts or info.name.startswith('simulator/gar-components'):return None
        if info.issym() or info.islnk():raise ValueError('Symlinks are not deployment inputs')
        info.mode=0o755 if info.isdir() else 0o644
        info.uid=info.gid=0
        info.uname=info.gname=''
        return info
    output=STATE/'product.tar.gz'
    with tarfile.open(output,'w:gz') as tar:
        for item in items:tar.add(ROOT/item,arcname=item,filter=keep)
    return output

def deploy():
    output=archive()
    scp(output,'garmyfriend.tar.gz')
    ssh('mkdir -p /home/gar/GarMyFriend && tar -xzf /home/gar/garmyfriend.tar.gz -C /home/gar/GarMyFriend && sh /home/gar/GarMyFriend/infra/virtualbox/install.sh')

def publish(open_page=False):
    binary=STATE/'cloudflared-linux-amd64'
    if not binary.exists():urllib.request.urlretrieve(TUNNEL_URL,binary)
    with binary.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
    if digest!=TUNNEL_SHA:raise ValueError('cloudflared checksum mismatch')
    scp(binary,'cloudflared-linux-amd64')
    ssh('sudo install -m 0755 /home/gar/cloudflared-linux-amd64 /usr/local/bin/cloudflared && sudo systemctl restart garmyfriend-tunnel.service')
    invocation=ssh('systemctl show garmyfriend-tunnel.service -p InvocationID --value',capture=True).strip()
    if not re.fullmatch('[0-9a-f]{32}',invocation):raise ValueError('Unknown tunnel process identity')
    url=None
    for attempt in range(30):
        log=ssh('sudo journalctl _SYSTEMD_INVOCATION_ID='+invocation+' --no-pager -o cat',capture=True)
        matches=re.findall(r'https://[a-z0-9-]+\.trycloudflare\.com',log)
        if matches:url=matches[-1];break
        time.sleep(1)
    if not url:raise RuntimeError('HTTPS tunnel did not become ready')
    ssh("mkdir -p /home/gar/.config/garmyfriend && printf '%s\\n' 'ROBOT_PANEL_ORIGIN="+url+"' > /home/gar/.config/garmyfriend/panel.env && sudo systemctl restart garmyfriend.service")
    error=None
    for attempt in range(30):
        try:
            with urllib.request.urlopen(url+'/health',timeout=8) as response:health=json.load(response)
            if health.get('product')!='orange-pi-face-lab' or health.get('host',{}).get('environment')!='virtualbox-linux' or not health.get('ok'):raise RuntimeError('VM /dev health is not ready')
            (STATE/'panel.json').write_text(json.dumps({'url':url,'invocationId':invocation,'vm':NAME,'health':health},indent=2)+'\n')
            print(url)
            if open_page:webbrowser.open(url)
            return
        except Exception as exc:error=exc;time.sleep(1)
    raise RuntimeError('HTTPS health check failed: '+str(error))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['start','stop','status','deploy','publish','open']);args=parser.parse_args()
    if args.command=='deploy':deploy()
    elif args.command=='publish':publish()
    elif args.command=='stop':run([VBOX,'controlvm',NAME,'acpipowerbutton'])
    elif args.command=='start':
        info=run([VBOX,'showvminfo',NAME,'--machinereadable'],capture=True).stdout
        if 'VMState="running"' not in info:run([VBOX,'startvm',NAME,'--type','headless'])
        print('VM is running. npm run vm:publish refreshes the HTTPS URL after a reboot.')
    elif args.command=='open':
        panel=json.loads((STATE/'panel.json').read_text());webbrowser.open(panel['url']);print(panel['url'])
    else:
        info=run([VBOX,'showvminfo',NAME,'--machinereadable'],capture=True).stdout
        print('\n'.join(line for line in info.splitlines() if line.startswith(('VMState=','memory=','cpus='))))
        if 'VMState="running"' in info:ssh('systemctl is-active garmyfriend garmyfriend-devices garmyfriend-tunnel; curl -fsS http://127.0.0.1:8773/health')

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,RuntimeError,subprocess.CalledProcessError) as error:raise SystemExit(str(error))
