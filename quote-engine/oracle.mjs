// Generador de "oráculo": maneja la hoja real (HyperFormula) headless y vuelca casos
// {entradas -> salidas} + la configuración de la financiera. Verdad de referencia para
// validar el motor en TypeScript (paridad al centavo).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const FILE='file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v75.html';
const OUT='/home/user/flujo-n8n-claude-code/quote-engine/oracle.json';
const PORT=9330;

const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'about:blank'],{stdio:'ignore'});
function rpc(ws){let id=0;const p=new Map();ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}});return (m,pr={})=>new Promise(res=>{const i=++id;p.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:pr}));});}
async function ev(send,expr){const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result&&r.result.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails.exception||r.result.exceptionDetails));return r.result.result.value;}

const OUTCELLS=['F16','F17','F18','F19','F20','F23','F25','F26','F27','F28','F30','F31','G21','G33','C24','C26','G14','H23','H25','H26','H27','H28','H31','H32','H33','AF11','J2'];
const promNames={1:'Completo',2:'Media',3:'Baja',4:'Sin Comision',5:'Referido $100'};

function caseExpr(ced,tipo,prom,monto,plazo){
  return `(()=>{
    setRaw('Calculadora','F1', ${JSON.stringify(ced)});
    ['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='G8'?1:0));
    setRaw('Calculadora','I1', ${JSON.stringify(promNames[prom])});
    setRaw('Calculadora','I2','Tipo Cliente ${tipo}');
    setRaw('Calculadora','D8',0);
    setRaw('Calculadora','D2', ${monto});
    setRaw('Calculadora','F14', ${plazo});
    setRaw('Calculadora','F17',0); setRaw('Calculadora','F18',0);
    const out={}; ${JSON.stringify(OUTCELLS)}.forEach(a1=>{const v=getV('Calculadora',a1); out[a1]=(v&&typeof v==='object')?('ERR:'+v.value):v;});
    const b6=getV('Motor','B6');
    return {out, promotorNoTiene:(String(b6)==='No tiene'), b6:String(b6)};
  })()`;
}

try{
  let target=null;for(let i=0;i<40;i++){try{const j=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const send=rpc(ws);await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:FILE});
  for(let i=0;i<120;i++){await sleep(250);try{const ok=await ev(send,`typeof getV==='function'&&typeof setRaw==='function'&&!!document.getElementById('cedSelect')`);if(ok)break;}catch(e){}}

  const config=await ev(send,`(()=>{
    const g=(a1)=>getV('Calculadora',a1);
    const mat=(r0)=>{const M=[];for(let r=r0;r<r0+6;r++){M.push(['L','M','N','O','P'].map(c=>g(c+r)));}return M;};
    return {
      matrizComision:mat(45), matrizInteres:mat(53), matrizGastoCierre:mat(61),
      itbmsRate:g('Y23'), timbresRate:g('Y25'), feciRate:g('Y26'), notaria:g('F30'), amCap:144,
      servicioRate:{G8:g('AF6'),G9:g('AF7'),G10:g('AF5'),G11_CSS:g('AF4'),G11:g('AF3'),G12:g('AF8')},
      tipoMaxPlazo:[1,2,3,4,5,6,7].map(c=>g('R'+(20+c)))
    };
  })()`);

  const ced=await ev(send,`(()=>{const s=document.getElementById('cedSelect');return s&&s.options.length?s.options[0].value:null;})()`);

  const cases=[];
  const montos=[1000,2500,4000,5000,8000,12000];
  const plazos=[18,24,36,48,60];
  for(let tipo=1; tipo<=7; tipo++) for(let prom=1; prom<=5; prom++) for(const monto of montos) for(const plazo of plazos){
    const rec=await ev(send, caseExpr(ced,tipo,prom,monto,plazo));
    cases.push({in:{monto,plazo,tipoCode:tipo,promotorIdx:prom,clave:'G8',esCSS:false,promotorNoTiene:rec.promotorNoTiene,refi:0,terceros:0,tercerosM:0}, out:rec.out});
  }
  writeFileSync(OUT, JSON.stringify({meta:{ced,source:'sheet v75',n:cases.length}, config, cases}, null, 1));
  const withErr=cases.filter(c=>Object.values(c.out).some(v=>typeof v==='string'&&String(v).startsWith('ERR:')));
  console.log('Oráculo:', cases.length, 'casos ->', OUT, '| con error:', withErr.length);
  ws.close();
}catch(e){console.error('ERROR',e);process.exitCode=1;}finally{proc.kill('SIGKILL');}
