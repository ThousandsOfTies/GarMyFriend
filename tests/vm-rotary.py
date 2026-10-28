"""Run in the VM: no expression shortcut while the GPIO reader is suspended."""
import json
import os
from pathlib import Path
import signal
import time
import urllib.request

BASE='http://127.0.0.1:8773'
def state():
    with urllib.request.urlopen(BASE+'/api/state',timeout=3) as response:return json.load(response)
def command(value):
    request=urllib.request.Request(BASE+'/api/command',data=json.dumps(value).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=3) as response:return json.load(response)

binary=Path('/home/gar/GarMyFriend/build/gar_rotary_input')
pids=[]
for entry in Path('/proc').glob('[0-9]*'):
    try:
        if (entry/'exe').resolve()==binary:pids.append(int(entry.name))
    except OSError:pass
assert len(pids)==1,pids
command({'type':'reset'})
before=state()
assert before['inputs']['rotary']['ready']
os.kill(pids[0],signal.SIGSTOP)
try:
    command({'type':'rotary','action':'rotate','direction':1})
    time.sleep(.3)
    paused=state()
    assert paused['expression']==before['expression'],'UI/API bypassed the GPIO reader'
    assert paused['inputs']['rotary']['counter']==before['inputs']['rotary']['counter']
finally:
    os.kill(pids[0],signal.SIGCONT)
for _ in range(30):
    if state()['expression']=='happy':break
    time.sleep(.1)
after=state()
assert after['expression']=='happy'
assert after['inputs']['rotary']['counter']==before['inputs']['rotary']['counter']+1
command({'type':'reset'})
print('PASS: no UI/API shortcut; only resumed GPIO event consumption changes the expression')
