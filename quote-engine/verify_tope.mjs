// Verifica topeLetraPagoAuto (F11) contra la hoja real, forzando salario (F2) e institución (B11).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { topeLetraPagoAuto } from './engine.ts';
const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const FILE='file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html';
const PORT=9332;
const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'about:blank'],{stdio:'ignore'});
function rpc(ws){let id=0;const p=new Map();ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}});return (m,pr={})=>new Promise(res=>{const i=++id;p.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:pr}));});}
async function ev(send,expr){const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result&&r.result.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails.exception||r.result.exceptionDetails));return r.result.result.value;}
try{
  let target=null;for(let i=0;i<40;i++){try{const j=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const send=rpc(ws);await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:FILE});
  for(let i=0;i<120;i++){await sleep(250);try{if(await ev(send,`typeof getV==='function'&&typeof setRaw==='function'`))break;}catch(e){}}
  const salarios=[400,499.99,500,700,750,800,1000,1200,1400,1500,1700,1900,2000,2200,2400,2500,3000];
  let fails=0, n=0;
  for(const esCSS of [false,true]){
    const inst = esCSS ? 'Caja de Seguro Social' : 'Contraloria General';
    for(const sal of salarios){
      const f11=await ev(send,`(()=>{setRaw('Calculadora','B11',${JSON.stringify(inst)});setRaw('Calculadora','F2',${sal});return getV('Calculadora','F11');})()`);
      const got=topeLetraPagoAuto(sal,esCSS);
      n++; if(got!==f11){fails++; console.log(`DIFF ${esCSS?'CSS':'Contra'} sal=${sal}: hoja=${f11} motor=${got}`);}
    }
  }
  console.log(`\nTope Pago Automático (F11): ${n} combinaciones | fallos: ${fails} ${fails? '':'✅ paridad total'}`);
  ws.close();
}catch(e){console.error('ERROR',e);process.exitCode=1;}finally{proc.kill('SIGKILL');}
