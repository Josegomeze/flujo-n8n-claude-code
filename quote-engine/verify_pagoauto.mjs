// Verifica letraAplicadaPagoAuto contra enforceTopePagoAuto (lógica real de la app):
// letra solicitada -> letra aplicada (dólar entero, topada por F11 y capacidad J13).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { letraAplicadaPagoAuto } from './engine.ts';
const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const FILE='file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html';
const PORT=9338;
const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'about:blank'],{stdio:'ignore'});
function rpc(ws){let id=0;const p=new Map();ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}});return (m,pr={})=>new Promise(res=>{const i=++id;p.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:pr}));});}
async function ev(send,expr){const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result&&r.result.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails.exception||r.result.exceptionDetails));return r.result.result.value;}
try{
  let target=null;for(let i=0;i<40;i++){try{const j=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const send=rpc(ws);await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:FILE});
  for(let i=0;i<120;i++){await sleep(250);try{if(await ev(send,`typeof enforceTopePagoAuto==='function'`))break;}catch(e){}}
  let n=0,fails=0;
  for(const esCSS of [false,true]) for(const F2 of [800,1200,1800,2600]) for(const F6 of [1500,4000]) for(const req of [20,50,80,150]){
    const r=await ev(send,`(()=>{
      ['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='G11'?1:0));
      setRaw('Calculadora','B11', ${JSON.stringify(esCSS?'Caja de Seguro Social':'Contraloria General')});
      setRaw('Calculadora','F2',${F2}); setRaw('Calculadora','F3',0); setRaw('Calculadora','F4',0); setRaw('Calculadora','F5',0); setRaw('Calculadora','F6',${F6});
      _letraReq=${req}; _plazoReq=undefined; setRaw('Calculadora','D2',0); setRaw('Calculadora','D8',${req});
      enforceTopePagoAuto();
      return {D8:getV('Calculadora','D8'), F11:getV('Calculadora','F11'), J13:getV('Calculadora','J13')};
    })()`);
    const got=letraAplicadaPagoAuto(req, F2, esCSS, r.J13);
    n++; if(Math.abs(got-r.D8)>0.005){fails++; if(fails<=8) console.log(`DIFF css=${esCSS} F2=${F2} F6=${F6} req=${req}: app D8=${r.D8} (F11=${r.F11} J13=${r.J13.toFixed(2)}) motor=${got}`);}
  }
  console.log(`\nAplicación tope Pago Automático: ${n} combinaciones | fallos: ${fails} ${fails?'':'✅ paridad total'}`);
  ws.close();
}catch(e){console.error('ERROR',e);process.exitCode=1;}finally{proc.kill('SIGKILL');}
