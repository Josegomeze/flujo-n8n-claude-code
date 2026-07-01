import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { createEngine } from './formula-engine.mjs';

const V76='/home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html';
const full=readFileSync(V76,'utf8');
const RAW=JSON.parse(full.match(/const RAW\s*=\s*(\{.*?\});/s)[1]);
const ORDER=Object.keys(RAW.wb);
const sheets={};
for(const s of ORDER){const info=RAW.wb[s];const g=Array.from({length:info.rows},()=>Array(info.cols).fill(null));for(const t of info.cells){g[t[0]-1][t[1]-1]=t[2];}sheets[s]=g;}
const eng=createEngine(sheets);
const idOf={}; ORDER.forEach((n,i)=>idOf[n]=i);
const colL=n=>{let s='';n++;while(n>0){let m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-m-1)/26);}return s;};
const pA1=a1=>{const m=a1.match(/^([A-Z]+)(\d+)$/);let n=0;for(const ch of m[1])n=n*26+(ch.charCodeAt(0)-64);return{c:n-1,r:+m[2]-1};};

const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const PORT=9351;
const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'about:blank'],{stdio:'ignore'});
function rpc(ws){let id=0;const p=new Map();ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}});return (m,pr={})=>new Promise(res=>{const i=++id;p.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:pr}));});}
async function ev(send,expr){const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result&&r.result.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails.exception));return r.result.result.value;}
function norm(v){ if(v&&typeof v==='object'){ if(typeof v.value==='string') return 'ERR'+v.value; return JSON.stringify(v);} return v; }
try{
  let target=null;for(let i=0;i<40;i++){try{const j=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const send=rpc(ws);await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:'file://'+V76});
  for(let i=0;i<120;i++){await sleep(250);try{if(await ev(send,`typeof getV==='function'`))break;}catch(e){}}

  const ced=RAW.wb.DATOS.cells.find(t=>t[1]===1 && t[0]>=6 && t[2])[2];
  const INPUTS=[['I2','Tipo Cliente 3'],['D2',5000],['D8',0],['F14',36],['I1','Completo'],
    ['G8',1],['G9',0],['G10',0],['G11',0],['G12',0],['F17',0],['F18',0],['AF1',0],['AF10',0],['F1',ced]];
  for(const [a1,v] of INPUTS){ const p=pA1(a1); eng.setCellContents({sheet:idOf['Calculadora'],col:p.c,row:p.r},[[v]]); }
  await ev(send,`(()=>{${INPUTS.map(([a,v])=>`setRaw('Calculadora',${JSON.stringify(a)},${JSON.stringify(v)});`).join('')}return 1;})()`);

  let totalDiffs=0;
  for(const sheet of ['Calculadora','Motor']){
    const coords=RAW.wb[sheet].cells.map(t=>[t[0],t[1]]);
    const truth=await ev(send,`(()=>{const out={};const C=${JSON.stringify(coords)};for(const [r,c] of C){const a1=(()=>{let n=c,s='';while(n>0){let m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-m-1)/26);}return s;})()+r;let v;try{v=getV(${JSON.stringify(sheet)},a1);}catch(e){v='THROW';}out[r+','+c]=(v&&typeof v==='object'&&typeof v.value==='string')?('ERR'+v.value):v;}return out;})()`);
    let diffs=0;const samples=[];
    for(const [r,c] of coords){
      const mine=norm(eng.getCellValue({sheet:idOf[sheet],col:c-1,row:r-1}));
      const th=truth[r+','+c];
      const both=(a,b)=>{ if(typeof a==='number'&&typeof b==='number') return Math.abs(a-b)<1e-6||Math.abs(a-b)<Math.abs(b)*1e-9; return a===b; };
      if(!both(mine,th)){ diffs++; if(samples.length<20) samples.push(`${colL(c-1)}${r}: mio=${JSON.stringify(mine)} hf=${JSON.stringify(th)}`); }
    }
    totalDiffs+=diffs;
    console.log(`\n[${sheet}] celdas: ${coords.length} | diferencias: ${diffs}`);
    samples.forEach(s=>console.log('   '+s));
  }
  console.log('\nTOTAL diferencias:', totalDiffs);
  ws.close();
}catch(e){console.error('ERROR',e);process.exitCode=1;}finally{proc.kill('SIGKILL');}
