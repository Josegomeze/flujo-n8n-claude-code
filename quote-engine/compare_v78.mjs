import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
const SC='/tmp/claude-0/-home-user-flujo-n8n-claude-code/648f466e-c036-52e6-bb2e-048579d55f44/scratchpad';
const DEMAND=JSON.parse(readFileSync(SC+'/demand_set.json','utf8')).filter(k=>!k.startsWith('DATOS!'));
const scenarios=[
  {n:'base G8 monto', code:`['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='G8'?1:0));setRaw('Calculadora','I1','Completo');setRaw('Calculadora','I2','Tipo Cliente 3');setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',5000);_letraReq=undefined;setRaw('Calculadora','F14',36);_plazoReq=36;`},
  {n:'G9 letra', code:`['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='G9'?1:0));setRaw('Calculadora','I1','Media');setRaw('Calculadora','I2','Tipo Cliente 1');setRaw('Calculadora','D2',0);setRaw('Calculadora','D8',150);_letraReq=150;setRaw('Calculadora','F14',60);_plazoReq=60;`},
  {n:'G10 referido', code:`['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='G10'?1:0));setRaw('Calculadora','I1','Referido $100');setRaw('Calculadora','I2','Tipo Cliente 4');setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',8000);_letraReq=undefined;setRaw('Calculadora','F14',60);_plazoReq=60;`},
  {n:'G11 CSS tipo6', code:`['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='G11'?1:0));setRaw('Calculadora','B11','Caja de Seguro Social');setRaw('Calculadora','I1','Baja');setRaw('Calculadora','I2','Tipo Cliente 6');setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',3000);_letraReq=undefined;setRaw('Calculadora','F14',72);_plazoReq=72;`},
  {n:'G12 af1 af10 tipo7', code:`['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='G12'?1:0));setRaw('Calculadora','AF1',1);setRaw('Calculadora','AF10',1);setRaw('Calculadora','I1','Sin Comision');setRaw('Calculadora','I2','Tipo Cliente 7');setRaw('Calculadora','D2',0);setRaw('Calculadora','D8',80);_letraReq=80;setRaw('Calculadora','F14',48);_plazoReq=48;`},
  {n:'capacidad', code:`setRaw('Calculadora','AF1',0);setRaw('Calculadora','AF10',0);['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='G8'?1:0));setRaw('Calculadora','I1','Completo');setRaw('Calculadora','I2','Tipo Cliente 5');setRaw('Calculadora','D2',0);setRaw('Calculadora','D8',0);_letraReq=undefined;setRaw('Calculadora','F14',48);_plazoReq=48;`},
  {n:'jubilación tope', code:`setRaw('Calculadora','I3',25000);['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='G8'?1:0));setRaw('Calculadora','I1','Completo');setRaw('Calculadora','I2','Tipo Cliente 1');setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',6000);_letraReq=undefined;setRaw('Calculadora','F14',300);_plazoReq=300;`},
  {n:'refi+terceros', code:`setRaw('Calculadora','I3',35027);['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='G8'?1:0));setRaw('Calculadora','I1','Completo');setRaw('Calculadora','I2','Tipo Cliente 3');setRaw('Calculadora','F17',1000);setRaw('Calculadora','F18',500);setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',9000);_letraReq=undefined;setRaw('Calculadora','F14',36);_plazoReq=36;`},
];
async function run(url,port){
  const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
  const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
  let id=0;const pend=new Map();const errs=[];
  let target=null;for(let i=0;i<50;i++){try{const j=await(await fetch(`http://127.0.0.1:${port}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errs.push((m.params.exceptionDetails.exception?.description||'').split('\n')[0]);});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails.exception).slice(0,300));return r.result.result.value;};
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url});
  for(let i=0;i<100;i++){await sleep(200);try{if(await ev(`typeof refreshAll==='function'&&!!document.getElementById('cedSelect')`))break;}catch(e){}}
  await sleep(300);
  const ced=await ev(`document.getElementById('cedSelect').options[0].value`);
  const out=[];
  for(const s of scenarios){
    await ev(`(()=>{setCedula(${JSON.stringify(ced)});${s.code}refreshAll();return 1;})()`);
    const snap=await ev(`(()=>{
      const norm=v=>(v&&typeof v==='object'&&typeof v.value==='string')?('ERR'+v.value):v;
      const cells={};
      for(const k of ${JSON.stringify(DEMAND)}){const i=k.indexOf('!');let v;try{v=getV(k.slice(0,i),k.slice(i+1));}catch(e){v='THROW';}cells[k]=norm(v);}
      const T={};
      T.cot=document.getElementById('cotHeader').innerText+'|'+document.getElementById('cotSummary').innerText+'|'+document.getElementById('cotWrap')?.innerText;
      const wf=document.getElementById('cotTable')||document.getElementById('cotWf');T.wf=wf?wf.innerText:'';
      T.client=document.getElementById('clientInfo').innerText;
      activeSheet='__TABLAS__';renderGrid();T.tablas=document.getElementById('gridWrap').innerText;
      activeSheet='__PROMOTORES__';renderGrid();T.prom=document.getElementById('gridWrap').innerText;
      activeSheet='Calculadora';try{renderGrid();}catch(e){}
      let cm=document.getElementById('gridWrap').innerText;const ix=cm.indexOf('1 · Entradas');cm=ix>=0?cm.slice(ix):cm;const cut=cm.indexOf('▸ Ver / editar celdas crudas');T.mapa=cut>=0?cm.slice(0,cut):cm;
      const fw=document.getElementById('finWrap');fw.dataset.open='1';renderFinParams();T.fin=fw.innerText;
      renderSuperAdmin();T.sa=document.getElementById('saWrap').innerText;
      const rb=document.getElementById('residualWrap')||document.getElementById('resWrap');T.resid=rb?rb.innerText:'';
      return {cells,T};
    })()`);
    out.push(snap);
  }
  proc.kill('SIGKILL');
  return {out,errs};
}
const A=await run('file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html',9390);
const B=await run('file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v78.html',9391);
console.log('errores JS v78:', B.errs.length?B.errs.slice(0,6):'ninguno');
let cellDiff=0, textDiff=0;
for(let i=0;i<scenarios.length;i++){
  const a=A.out[i], b=B.out[i]; let cd=0; const samp=[];
  for(const k of Object.keys(a.cells)){
    const x=a.cells[k], y=b.cells[k];
    const eq=(typeof x==='number'&&typeof y==='number')?(Math.abs(x-y)<1e-6||Math.abs(x-y)<Math.abs(x)*1e-9):(x===y);
    if(!eq){cd++;if(samp.length<6)samp.push(`${k}: v76=${JSON.stringify(x)} v78=${JSON.stringify(y)}`);}
  }
  let td=[];
  for(const p of Object.keys(a.T)){ if(a.T[p]!==b.T[p]) td.push(p); }
  cellDiff+=cd; textDiff+=td.length;
  console.log(`[${scenarios[i].n}] celdas dif: ${cd}/${Object.keys(a.cells).length} | paneles con texto distinto: ${td.join(',')||'ninguno'}`);
  samp.forEach(x=>console.log('   '+x));
}
console.log(`\n==== TOTAL: celdas dif ${cellDiff} | paneles dif ${textDiff} ====`);
