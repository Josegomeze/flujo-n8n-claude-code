import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
const SC='/tmp/claude-0/-home-user-flujo-n8n-claude-code/648f466e-c036-52e6-bb2e-048579d55f44/scratchpad';
const DEMAND=JSON.parse(readFileSync(SC+'/demand_set.json','utf8')).filter(k=>!k.startsWith('DATOS!'));

// Barrido: 5 claves × tipos [1,3,6,7] × [monto,letra] + capacidad por clave + extremos
const scenarios=[];
const claveSetup=(cl,css)=>`['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='${cl}'?1:0));${css?`setRaw('Calculadora','B11','Caja de Seguro Social');`:''}`;
for(const cl of ['G8','G9','G10','G11','G12']) for(const t of [1,3,6,7]) {
  scenarios.push({n:`${cl} t${t} monto`, code:`${claveSetup(cl,false)}setRaw('Calculadora','I1','Completo');setRaw('Calculadora','I2','Tipo Cliente ${t}');setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',5000);_letraReq=undefined;setRaw('Calculadora','F14',48);_plazoReq=48;`});
  scenarios.push({n:`${cl} t${t} letra`, code:`${claveSetup(cl,false)}setRaw('Calculadora','I1','Media');setRaw('Calculadora','I2','Tipo Cliente ${t}');setRaw('Calculadora','D2',0);setRaw('Calculadora','D8',120);_letraReq=120;setRaw('Calculadora','F14',48);_plazoReq=48;`});
}
for(const cl of ['G8','G9','G10','G11','G12'])
  scenarios.push({n:`${cl} capacidad`, code:`${claveSetup(cl,cl==='G11')}setRaw('Calculadora','I1','Completo');setRaw('Calculadora','I2','Tipo Cliente 3');setRaw('Calculadora','D2',0);setRaw('Calculadora','D8',0);_letraReq=undefined;setRaw('Calculadora','F14',60);_plazoReq=60;`});
// extremos
scenarios.push({n:'EXTREMO cédula inexistente', code:`setRaw('Calculadora','F1','NO-EXISTE-999');${claveSetup('G8',false)}setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',5000);_letraReq=undefined;setRaw('Calculadora','F14',36);_plazoReq=36;`});
scenarios.push({n:'EXTREMO plazo 1', code:`${claveSetup('G8',false)}setRaw('Calculadora','I2','Tipo Cliente 3');setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',1000);_letraReq=undefined;setRaw('Calculadora','F14',1);_plazoReq=1;`});
scenarios.push({n:'EXTREMO letra 1 (anulación)', code:`${claveSetup('G8',false)}setRaw('Calculadora','I2','Tipo Cliente 3');setRaw('Calculadora','D2',0);setRaw('Calculadora','D8',1);_letraReq=1;setRaw('Calculadora','F14',36);_plazoReq=36;`});
scenarios.push({n:'EXTREMO monto 100000', code:`${claveSetup('G8',false)}setRaw('Calculadora','I2','Tipo Cliente 1');setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',100000);_letraReq=undefined;setRaw('Calculadora','F14',300);_plazoReq=300;`});
scenarios.push({n:'EXTREMO ref+ter+af1+af10', code:`${claveSetup('G9',false)}setRaw('Calculadora','AF1',1);setRaw('Calculadora','AF10',1);setRaw('Calculadora','F17',2000);setRaw('Calculadora','F18',800);setRaw('Calculadora','I2','Tipo Cliente 4');setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',12000);_letraReq=undefined;setRaw('Calculadora','F14',72);_plazoReq=72;`});

async function run(url,port){
  const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
  const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
  let id=0;const pend=new Map();const errs=[];
  let target=null;for(let i=0;i<50;i++){try{const j=await(await fetch(`http://127.0.0.1:${port}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errs.push((m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text||'').split('\n')[0]);});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails.exception).slice(0,200));return r.result.result.value;};
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url});
  for(let i=0;i<100;i++){await sleep(200);try{if(await ev(`typeof refreshAll==='function'&&!!document.getElementById('cedSelect')`))break;}catch(e){}}
  await sleep(300);
  const ced=await ev(`document.getElementById('cedSelect').options[0].value`);
  const out=[];
  for(const s of scenarios){
    let panelErr='';
    try{
      await ev(`(()=>{setCedula(${JSON.stringify(ced)});${s.code}refreshAll();
        activeSheet='__TABLAS__';renderGrid();activeSheet='Calculadora';renderGrid();
        const fw=document.getElementById('finWrap');fw.dataset.open='1';renderFinParams();renderSuperAdmin();return 1;})()`);
    }catch(e){panelErr=String(e).slice(0,120);}
    const cells=await ev(`(()=>{const norm=v=>(v&&typeof v==='object'&&typeof v.value==='string')?('ERR'+v.value):v;const out={};for(const k of ${JSON.stringify(DEMAND)}){const i=k.indexOf('!');let v;try{v=getV(k.slice(0,i),k.slice(i+1));}catch(e){v='THROW';}out[k]=norm(v);}return out;})()`);
    out.push({cells,panelErr});
  }
  proc.kill('SIGKILL');
  return {out,errs};
}
const A=await run('file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html',9400);
const B=await run('file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v78.html',9401);
let cellDiff=0, scenFail=0, errCellsA=0, errCellsB=0;
for(let i=0;i<scenarios.length;i++){
  const a=A.out[i],b=B.out[i];let cd=0;const samp=[];
  for(const k of Object.keys(a.cells)){
    const x=a.cells[k],y=b.cells[k];
    if(typeof x==='string'&&x.startsWith('ERR'))errCellsA++;
    if(typeof y==='string'&&y.startsWith('ERR'))errCellsB++;
    const eq=(typeof x==='number'&&typeof y==='number')?(Math.abs(x-y)<1e-6||Math.abs(x-y)<Math.abs(x)*1e-9):(x===y);
    if(!eq){cd++;if(samp.length<5)samp.push(`${k}: v76=${JSON.stringify(x)} v78=${JSON.stringify(y)}`);}
  }
  if(cd||a.panelErr||b.panelErr){scenFail++;console.log(`[${scenarios[i].n}] dif:${cd} panelErr76:${a.panelErr||'-'} panelErr78:${b.panelErr||'-'}`);samp.forEach(x=>console.log('   '+x));}
  cellDiff+=cd;
}
console.log(`\nEscenarios: ${scenarios.length} | con diferencias: ${scenFail} | celdas dif total: ${cellDiff}`);
console.log(`Celdas con error (esperadas iguales): v76=${errCellsA} v78=${errCellsB}`);
console.log('Excepciones JS v76:', A.errs.length?A.errs.slice(0,4):'ninguna');
console.log('Excepciones JS v78:', B.errs.length?B.errs.slice(0,4):'ninguna');
