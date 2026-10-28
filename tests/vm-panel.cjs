// End-to-end test against the running VirtualBox VM, through its HTTPS panel.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const url = JSON.parse(fs.readFileSync(path.join(root, '.gar/vm/panel.json'))).url;
(async () => {
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  try {
    const page = await browser.newPage({ viewport:{width:1440,height:1050} });
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url, {waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForSelector('#connection.online',{timeout:30000});
    const command = value => page.evaluate(async value => {
      const response=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
      if(!response.ok)throw new Error(await response.text());return response.json();
    },value);
    const state = () => page.evaluate(async()=>(await fetch('/api/state')).json());
    const waitState = async predicate => {
      const deadline=Date.now()+20000;
      do {const value=await state();if(predicate(value))return value;await page.waitForTimeout(200);}while(Date.now()<deadline);
      throw new Error('VM driver result did not become ready');
    };
    await command({type:'reset'});await command({type:'motion',autoBlink:false});
    const initial=await waitState(s=>s.io.displayReady&&s.io.frames>2);
    assert.equal(initial.host.environment,'virtualbox-linux');assert.equal(initial.host.platform,'linux');
    assert.equal(initial.io.backend,'linux-dev');assert.deepEqual(initial.io.devices,['/dev/spidev0.0','/dev/i2c-1','/dev/gpiochip0']);
    const neutral=initial.io.frameId;
    await page.locator('[data-expression="happy"]').click();
    await waitState(s=>s.expression==='happy'&&s.io.frameId!==neutral);
    await page.waitForTimeout(900);await command({type:'pause',value:true});
    // Compare every canvas pixel with the bytes read from the CUSE driver's bridge.
    await page.waitForTimeout(1200);
    const matches=await page.evaluate(async()=>{
      const bytes=new Uint8Array(await(await fetch('/api/io/frame')).arrayBuffer());
      if(bytes.length!==115200)return false;
      const {decodeRgb565}=await import('/gar-components/framebuffer.mjs');
      const expected=decodeRgb565(bytes,{width:240,height:240,littleEndian:false});
      const actual=document.querySelector('#screen').displayContext.getImageData(0,0,240,240).data;
      return expected.every((value,index)=>actual[index]===value);
    });assert.equal(matches,true,'Panel must show the actual driver framebuffer');
    await command({type:'pause',value:false});
    await command({type:'joint',id:'leftHip',angle:30});
    await waitState(s=>s.joints[0].angle===30&&s.io.pwm.channels[0].off>350);
    await page.locator('#stop').click();
    await waitState(s=>s.stopped&&s.io.pwm.channels.slice(0,6).every(c=>c.fullOff));
    await page.waitForTimeout(500);
    const pwm=await page.locator('#virtual-pwm').evaluate(device=>device.state);
    assert.ok(pwm.channels.slice(0,6).every(c=>c.fullOff));
    await command({type:'reset'});await waitState(s=>!s.stopped&&s.io.pwm.channels.slice(0,6).every(c=>!c.fullOff));
    await page.waitForTimeout(700);
    fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
    await page.screenshot({path:path.join(root,'artifacts/vm-webpanel.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: HTTPS → Linux VM → /dev SPI/GPIO/I2C → GAR bridge → exact RGB565 canvas and PWM stop/reset');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
