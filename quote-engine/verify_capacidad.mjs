// Verifica capacidadQuincenal (J13/J14) contra la hoja, forzando datos del cliente (F2:F6) y clave.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { capacidadQuincenal } from './engine.ts';
const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const FILE='file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html';
const PORT=9335;
const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'about:blank'],{stdio:'ignore'});
function rpc(ws){let id=0;const p=new Map();ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}});return (m,pr={})=>new Promise(res=>{const i=++id;p.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:pr}));});}
async function ev(send,expr){const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result&&r.result.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails.exception||r.result.exceptionDetails));return r.result.result.value;}
try{
  let target=null;for(let i=0;i<40;i++){try{const j=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const send=rpc(ws);await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:FILE});
  for(let i=0;i<120;i++){await sleep(250);try{if(await ev(send,`typeof getV==='function'&&typeof setRaw==='function'`))break;}catch(e){}}
  let n=0,fails=0;const claves=['G8','G9','G10','G11','G12'];
  for(const clave of claves) for(const esCSS of (clave==='G11'?[false,true]:[false]))
    for(const F2 of [600,800,1000,1500,2000,3000]) for(const F3 of [0,150]) for(const F5 of [0,250]) for(const F4 of [0,50]) for(const F6 of [600,1800,4000]){
      const inst = esCSS ? 'Caja de Seguro Social' : 'Contraloria';
      const sheet=await ev(send,`(()=>{
        ['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k===${JSON.stringify(clave)}?1:0));
        setRaw('Calculadora','B11',${JSON.stringify(inst)});
        setRaw('Calculadora','F2',${F2});setRaw('Calculadora','F3',${F3});setRaw('Calculadora','F4',${F4});setRaw('Calculadora','F5',${F5});setRaw('Calculadora','F6',${F6});
        const j13=getV('Calculadora','J13'),j14=getV('Calculadora','J14');
        return {j13:(j13&&typeof j13==='object')?('ERR:'+j13.value):j13, j14:(j14&&typeof j14==='object')?('ERR:'+j14.value):j14};
      })()`);
      const got=capacidadQuincenal({salario:F2,descComercial:F3,claveN147:F4,embargos:F5,descontable:F6},clave,esCSS);
      n++;
      const d13=Math.abs(got.J13-sheet.j13), d14=Math.abs(got.J14-sheet.j14);
      if(!(d13<0.005 && d14<0.005)){fails++; if(fails<=8) console.log(`DIFF ${clave} css=${esCSS} F2=${F2} F3=${F3} F4=${F4} F5=${F5} F6=${F6}: hoja J13=${sheet.j13} J14=${sheet.j14} | motor J13=${got.J13.toFixed(4)} J14=${got.J14}`);}
    }
  console.log(`\nCapacidad (J13/J14): ${n} combinaciones | fallos: ${fails} ${fails?'':'✅ paridad total'}`);
  ws.close();
}catch(e){console.error('ERROR',e);process.exitCode=1;}finally{proc.kill('SIGKILL');}
