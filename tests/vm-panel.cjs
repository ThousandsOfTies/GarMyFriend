const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const url=JSON.parse(fs.readFileSync('.gar/vm/panel.json')).url;
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>!document.querySelector('#rotary').disabled,{timeout:30000});
    const state=()=>page.evaluate(async()=>(await fetch('/api/state')).json());
    const before=await state();assert.deepEqual(Object.keys(before).sort(),['io','rotary']);
    const knob=page.locator('#rotary');
    await knob.getByRole('button',{name:'Rotate clockwise',exact:true}).click();
    await page.waitForFunction(async n=>(await(await fetch('/api/state')).json()).rotary.counter===n,before.rotary.counter+1);
    await page.waitForTimeout(700);const changed=await state();assert.notEqual(changed.io.frameId,before.io.frameId);
    await knob.getByRole('button',{name:'Rotate counter-clockwise',exact:true}).click();
    await page.waitForFunction(async n=>(await(await fetch('/api/state')).json()).rotary.counter===n,before.rotary.counter);
    await knob.getByRole('button',{name:'PRESS',exact:true}).click();await page.waitForTimeout(700);
    let matches=false;
    for(let attempt=0;attempt<20&&!matches;attempt++){
      matches=await page.evaluate(async()=>{
        const bytes=new Uint8Array(await(await fetch('/api/io/frame')).arrayBuffer());
        const {decodeRgb565}=await import('/gar-components/framebuffer.mjs');
        const expected=decodeRgb565(bytes,{width:240,height:240,littleEndian:false});
        const actual=document.querySelector('#screen').displayContext.getImageData(0,0,240,240).data;
        return expected.every((value,index)=>actual[index]===value);
      });if(!matches)await page.waitForTimeout(100);
    }
    assert.ok(matches,'Canvas must match the actual SPI driver framebuffer');
    assert.equal(await page.locator('main > section').count(),2);assert.equal(await page.locator('main').evaluate(root=>root.querySelectorAll('button').length),0);
    fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/vm-webpanel.png',fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS: HTTPS two-part panel; GPIO counter; independent application SPI output; exact canvas pixels');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
