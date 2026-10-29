const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createSimulatorServer}=require('../simulation/server.cjs');
function frame(color){const data=Buffer.alloc(115200);for(let i=0;i<data.length;i+=2)data.writeUInt16BE(color,i);return data;}
(async()=>{
  const calls=[];
  const bridge={frame:frame(0xff00),frameId:'first',counter:0,status(){return {displayReady:true,frameId:this.frameId};},state(){return {io:this.status(),rotary:{ready:true,counter:this.counter}};},async inject(input){calls.push(input);if(input.action==='rotate')this.counter+=input.direction;},close(){}};
  const server=createSimulatorServer({deviceBridge:bridge});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const knob=page.locator('#rotary'),plus=knob.getByRole('button',{name:'Rotate clockwise',exact:true});
    await plus.waitFor();await page.waitForFunction(()=>!document.querySelector('#rotary').disabled);
    assert.equal(await page.locator('main > section').count(),2);
    assert.deepEqual(await page.locator('h2').allTextContents(),['顔のディスプレイ','ノブで表情を変える']);
    assert.equal(await page.locator('gar-sg90,gar-pca9685,gar-sbc-board,#expressions,#scenarios,#record,#pause').count(),0);
    const pixels=()=>page.locator('#screen').evaluate(display=>display.displayContext.canvas.toDataURL());
    const first=await pixels();await plus.click();
    await page.waitForFunction(()=>document.querySelector('#rotary').value===1);
    assert.equal(await pixels(),first,'Only driver pixels may change the display');
    await knob.getByRole('button',{name:'Rotate counter-clockwise',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#rotary').value===0);
    await knob.getByRole('button',{name:'Press rotary encoder',exact:true}).focus();await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(()=>document.querySelector('#rotary').value===-1);
    await knob.getByRole('button',{name:'PRESS',exact:true}).click();await page.waitForTimeout(100);
    assert.deepEqual(calls,[{action:'rotate',direction:1},{action:'rotate',direction:-1},{action:'rotate',direction:-1},{action:'press'}]);
    bridge.frame=frame(0x001f);bridge.frameId='second';
    await page.waitForFunction(old=>document.querySelector('#screen').displayContext.canvas.toDataURL()!==old,first);
    for(const width of [320,760,1440]){await page.setViewportSize({width,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    fs.mkdirSync('artifacts',{recursive:true});await page.setViewportSize({width:1000,height:750});await page.screenshot({path:'artifacts/parts-fixture.png',fullPage:true});
    await browser.close();assert.deepEqual(errors,[]);
    console.log('PASS: only display and rotary; raw events, driver-only pixels, keyboard, responsive 320/760/1440');
  }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
