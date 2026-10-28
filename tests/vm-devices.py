"""Run inside the dedicated VM. Briefly pauses only GarMyFriend's native writer."""
import json
import os
from pathlib import Path
import signal
import stat
import time
import urllib.error
import urllib.request

BASE='http://127.0.0.1:8773'
def health():
    with urllib.request.urlopen(BASE+'/health',timeout=3) as response:return json.load(response)

for name in ['spidev0.0','i2c-1','gpiochip0']:
    assert stat.S_ISCHR(Path('/dev',name).stat().st_mode),name+' must be a character device'
writer=Path('/home/gar/GarMyFriend/build/device-output')
pids=[]
for entry in Path('/proc').glob('[0-9]*'):
    try:
        if (entry/'exe').resolve()==writer:pids.append(int(entry.name))
    except OSError:pass
assert len(pids)==1,('expected one owned native writer',pids)
assert health()['ok']
os.kill(pids[0],signal.SIGSTOP)
try:
    time.sleep(3.5)
    state=health()
    assert not state['ok'] and not state['io']['displayReady'],state['io']
    try:
        urllib.request.urlopen(BASE+'/api/io/frame',timeout=3)
        raise AssertionError('stale framebuffer must not be reported as live')
    except urllib.error.HTTPError as error:assert error.code==503
finally:
    os.kill(pids[0],signal.SIGCONT)
for _ in range(40):
    if health()['ok']:break
    time.sleep(.2)
assert health()['ok'],'native writer did not recover'
print('PASS: real character devices; stopped writer reports unavailable, no stale-frame fallback; resume recovers')
