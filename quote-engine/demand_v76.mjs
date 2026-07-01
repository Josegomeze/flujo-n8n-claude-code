import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync, writeFileSync } from 'node:fs';
const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const PORT=9380;
const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'about:blank'],{stdio:'ignore'});
let id=0;const pend=new Map();
try{
  let target=null;for(let i=0;i<50;i++){try{const j=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails.exception).slice(0,200));return r.result.result.value;};
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html'});
  for(let i=0;i<80;i++){await sleep(200);try{if(await ev(`typeof refreshAll==='function'`))break;}catch(e){}}
  await sleep(300);
  // instrumentar getV (getN/gv delegan en getV)
  await ev(`(()=>{window.__seen=new Set();const orig=getV;getV=function(sh,a1){__seen.add(sh+'!'+a1);return orig(sh,a1);};return 1;})()`);
  const ced=await ev(`document.getElementById('cedSelect').options[0].value`);
  const scenarios=[
    {clave:'G8',prom:'Completo',tipo:3,mode:'monto',val:5000,plazo:36},
    {clave:'G9',prom:'Media',tipo:1,mode:'letra',val:150,plazo:60},
    {clave:'G10',prom:'Referido $100',tipo:4,mode:'monto',val:8000,plazo:60},
    {clave:'G11',prom:'Baja',tipo:6,mode:'monto',val:3000,plazo:72,css:1},
    {clave:'G12',prom:'Sin Comision',tipo:7,mode:'letra',val:80,plazo:48,af1:1,af10:1},
    {clave:'G8',prom:'Completo',tipo:5,mode:'cap',val:0,plazo:48},
  ];
  for(const s of scenarios){
    await ev(`(()=>{
      setCedula(${JSON.stringify(ced)});
      ['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k===${JSON.stringify(s.clave)}?1:0));
      ${s.css?`setRaw('Calculadora','B11','Caja de Seguro Social');`:''}
      setRaw('Calculadora','I1',${JSON.stringify(s.prom)});
      setRaw('Calculadora','I2','Tipo Cliente '+${s.tipo});
      setRaw('Calculadora','AF1',${s.af1||0});setRaw('Calculadora','AF10',${s.af10||0});
      ${s.mode==='monto'?`setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',${s.val});_letraReq=undefined;`:
        s.mode==='letra'?`setRaw('Calculadora','D2',0);setRaw('Calculadora','D8',${s.val});_letraReq=${s.val};`:
        `setRaw('Calculadora','D2',0);setRaw('Calculadora','D8',0);_letraReq=undefined;`}
      setRaw('Calculadora','F14',${s.plazo});_plazoReq=${s.plazo};
      refreshAll();
      // paneles
      activeSheet='__TABLAS__';renderGrid();
      activeSheet='__PROMOTORES__';renderGrid();
      const fw=document.getElementById('finWrap');fw.dataset.open='1';renderFinParams();
      renderSuperAdmin();
      fillModalLists();calcMapHTML();datosDocHTML();
      // modo residual (letra máx) también
      _letraMode='residual';applyLetraMode();_letraMode='deseada';applyLetraMode();
      return 1;})()`);
  }
  const seen=await ev(`[...__seen]`);
  writeFileSync(process.env.SC+'/demand.json', JSON.stringify(seen));
  console.log('celdas leídas únicas:', seen.length);
  ws.close();
}catch(e){console.error('ERROR',String(e).slice(0,400));process.exitCode=1;}finally{proc.kill('SIGKILL');}
