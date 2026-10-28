'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');

/** Product adapter: application output goes only to the native /dev writer.
 * The Web Panel observes the independent GAR driver bridge, never this input. */
class LinuxDevices {
  constructor(root) {
    if (process.platform !== 'linux') throw new Error('The Linux /dev backend requires Linux.');
    this.frame = null; this.pwm = null; this.frameId = null; this.frames = 0;
    this.error = null; this.live = false; this.busy = false; this.closed = false;
    this.child = spawn(path.join(root, 'build/device-output'), [], { cwd:root, stdio:['pipe','pipe','pipe'] });
    let pending = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      pending += chunk;
      for (;;) {
        const index = pending.indexOf('\n'); if (index < 0) break;
        const line = pending.slice(0,index); pending = pending.slice(index+1);
        try { const result=JSON.parse(line); this.frames=result.frames; this.live=true; this.lastAck=Date.now(); this.error=null; this.busy=false; this.flush(); } catch { this.error='デバイス出力の応答が不正です'; }
      }
    });
    this.child.stderr.on('data', chunk => { this.error=String(chunk).trim().slice(-500); });
    this.child.on('error', error => { this.error=error.message; this.live=false; });
    this.child.on('close', code => { this.error=this.error||`デバイス出力が終了しました (${code})`;this.live=false; });
    this.child.stdin.on('error', error => { this.error=error.message;this.live=false; });
    this.poll();
  }
  submit(state) { this.next=state;this.flush(); }
  flush() {
    if (this.busy||!this.next||this.closed||!this.child.stdin.writable) return;
    const state=this.next;this.next=null;this.busy=true;
    const keys=['eyeRx','eyeRy','eyeY','leftOpen','rightOpen','happyEye','tilt','mouthY','mouthW','mouthCurve','mouthOpen','cheek'];
    const values=[...keys.map(k=>state.pose[k]),state.effects.gazeX,state.effects.gazeY,1-state.effects.blink,state.effects.talk,...state.joints.map(j=>j.angle),state.stopped?1:0];
    this.child.stdin.write(values.join(' ')+'\n');
  }
  async poll() {
    if (this.closed) return;
    try {
      const response=await fetch('http://127.0.0.1:8080/api/state',{signal:AbortSignal.timeout(1500)});
      if(!response.ok)throw new Error(`GAR Bridge HTTP ${response.status}`);
      const state=await response.json();
      const display=state.spi?.gc9a01;
      if(display?.pixels&&display.width===240&&display.height===240){
        const frame=Buffer.from(display.pixels,'base64');
        if(frame.length!==115200)throw new Error('ドライバのフレームサイズが不正です');
        this.frame=frame;this.frameId=crypto.createHash('sha256').update(frame).digest('hex');
      }
      this.pwm=state.i2c?.pca9685||null;this.observedAt=Date.now();this.bridgeError=null;
    }catch(error){this.bridgeError=error.message;}
    if(!this.closed){this.timer=setTimeout(()=>this.poll(),80);this.timer.unref();}
  }
  status(){
    const live=this.live&&Date.now()-this.lastAck<3000;
    const error=this.error||this.bridgeError||(this.live&&!live?'デバイス出力の応答が止まっています':null);
    return {backend:'linux-dev',live,frames:this.frames,frameId:this.frameId,displayReady:Boolean(this.frame)&&!this.bridgeError&&live,pwm:this.pwm,bridgeReady:!this.bridgeError&&Boolean(this.observedAt),error,devices:['/dev/spidev0.0','/dev/i2c-1','/dev/gpiochip0'],source:'GAR CUSE / gpio-sim → Bridge'};
  }
  close(){this.closed=true;clearTimeout(this.timer);this.child.kill('SIGTERM');}
}
module.exports={LinuxDevices};
