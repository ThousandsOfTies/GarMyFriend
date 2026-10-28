import '/gar-components/display.mjs';
import '/gar-components/rotary.mjs';

// Physical-part adapter only: display received pixels and forward knob actions.
const screen=document.querySelector('#screen'),knob=document.querySelector('#rotary'),status=document.querySelector('#status');
let disposed=false,timer,frameId=null,connected=false,queue=Promise.resolve();
async function request(url,options={}){
  const response=await fetch(url,{cache:'no-store',...options,signal:AbortSignal.timeout(2500)});
  if(!response.ok)throw new Error('Part connection unavailable');
  return response;
}
function connection(ready){connected=ready;knob.disabled=!ready;status.hidden=ready;status.textContent='部品との接続を確認中';}
async function poll(){
  try{
    const state=await(await request('/api/state')).json();
    connection(state.io.displayReady&&state.rotary.ready);
    if(knob.value!==state.rotary.counter)knob.value=state.rotary.counter;
    if(state.io.displayReady&&state.io.frameId!==frameId){
      const response=await request('/api/io/frame'),bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length!==115200)throw new Error('Invalid display frame');
      screen.writeFrame(bytes,{littleEndian:false});frameId=response.headers.get('ETag')||state.io.frameId;
    }
  }catch{connection(false);}
  finally{if(!disposed)timer=setTimeout(poll,connected?(document.hidden?500:80):1000);}
}
knob.addEventListener('gar-rotary-input',({detail})=>{
  if(!connected)return;
  const input=detail.type==='rotate'?{action:'rotate',direction:detail.direction}:{action:'press'};
  queue=queue.then(async()=>{
    if(disposed)return;
    try{await request('/api/rotary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});}
    catch{connection(false);}
  });
});
window.addEventListener('pagehide',()=>{disposed=true;clearTimeout(timer);});
poll();
