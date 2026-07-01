import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync, writeFileSync } from 'node:fs';
const RAW=JSON.parse(readFileSync('/home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html','utf8').match(/const RAW\s*=\s*(\{.*?\});/s)[1]);
const COORDS={Calculadora:RAW.wb.Calculadora.cells.map(t=>[t[0],t[1]]),Motor:RAW.wb.Motor.cells.map(t=>[t[0],t[1]])};
const ced=RAW.wb.DATOS.cells.find(t=>t[1]===1&&t[0]>=6&&t[2])[2];
const scenarios=[
  {clave:'G8',prom:'Completo',tipo:3,mode:'monto',val:5000,plazo:36},
  {clave:'G8',prom:'Referido $100',tipo:1,mode:'letra',val:150,plazo:60,af1:0,af10:0},
  {clave:'G11',prom:'Media',tipo:6,mode:'monto',val:3000,plazo:72,af1:1},
  {clave:'G12',prom:'Baja',tipo:7,mode:'letra',val:80,plazo:48,af10:1},
  {clave:'G10',prom:'Completo',tipo:4,mode:'monto',val:8000,plazo:60},
];
const scEx=s=>`(()=>{setRaw('Calculadora','F1',${JSON.stringify(ced)});['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k===${JSON.stringify(s.clave)}?1:0));setRaw('Calculadora','I1',${JSON.stringify(s.prom)});setRaw('Calculadora','I2','Tipo Cliente '+${s.tipo});setRaw('Calculadora','AF1',${s.af1||0});setRaw('Calculadora','AF10',${s.af10||0});${s.mode==='monto'?`setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',${s.val});`:`setRaw('Calculadora','D2',0);setRaw('Calculadora','D8',${s.val});`}setRaw('Calculadora','F14',${s.plazo});_plazoReq=${s.plazo};_letraReq=undefined;refreshAll();return 1;})()`;
const dumpEx=`(()=>{const norm=v=>(v&&typeof v==='object'&&typeof v.value==='string')?('ERR'+v.value):v;const out={};const C=${JSON.stringify(COORDS)};for(const sh of Object.keys(C)){for(const [r,c] of C[sh]){const a1=(()=>{let n=c,s='';while(n>0){let m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-m-1)/26);}return s;})()+r;let v;try{v=getV(sh,a1);}catch(e){v='THROW';}out[sh+'!'+a1]=norm(v);}}return out;})()`;
async function run(url,port){
  const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
  const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
  let id=0;const pend=new Map();
  let target=null;for(let i=0;i<50;i++){try{const j=await(await fetch(`http://127.0.0.1:${port}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw new Error('EXC');return r.result.result.value;};
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url});
  for(let i=0;i<80;i++){await sleep(200);try{if(await ev(`typeof refreshAll==='function'`))break;}catch(e){}}
  await sleep(300);
  const dumps=[];
  for(const s of scenarios){ await ev(scEx(s)); dumps.push(await ev(dumpEx)); }
  proc.kill('SIGKILL'); return dumps;
}
const A=await run('file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html',9372);
const B=await run('file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v77.html',9373);
let total=0;
for(let i=0;i<scenarios.length;i++){
  const da=A[i],db=B[i];let diff=0;const samp=[];
  for(const k of Object.keys(da)){const a=da[k],b=db[k];const eq=(typeof a==='number'&&typeof b==='number')?(Math.abs(a-b)<1e-6||Math.abs(a-b)<Math.abs(a)*1e-9):(a===b);if(!eq){diff++;if(samp.length<6)samp.push(`${k}: v76=${JSON.stringify(a)} v77=${JSON.stringify(b)}`);}}
  total+=diff;console.log(`Escenario ${i+1} ${JSON.stringify(scenarios[i]).slice(0,60)}: diferencias ${diff}/${Object.keys(da).length}`);
  samp.forEach(x=>console.log('   '+x));
}
console.log('\n==== TOTAL diferencias v76 vs v77:', total, '====');
