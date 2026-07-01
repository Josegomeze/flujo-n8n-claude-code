import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const PORT=9395;
const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'about:blank'],{stdio:'ignore'});
let id=0;const pend=new Map();const errs=[];
try{
  let target=null;for(let i=0;i<50;i++){try{const j=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errs.push((m.params.exceptionDetails.exception?.description||'').split('\n')[0]);});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails.exception).slice(0,250));return r.result.result.value;};
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v78.html'});
  for(let i=0;i<100;i++){await sleep(200);try{if(await ev(`typeof refreshAll==='function'`))break;}catch(e){}}
  await sleep(400);
  // 1) agregar cliente por modal
  const r1=await ev(`(()=>{openClientModal();
    document.getElementById('mCed').value='8-TEST-999';document.getElementById('mNom').value='Prueba';document.getElementById('mApe').value='Motor';
    document.getElementById('mSal').value='1500';document.getElementById('mDesc').value='50';
    document.getElementById('mTipo').value=[...document.getElementById('mTipo').options][0].value;
    saveClient();closeClientModal();
    return {msg:document.getElementById('mErr').textContent, F1:getV('Calculadora','F1'), salario:getV('Calculadora','F2'), nombre:getV('Cotizacion Int.','B10')};})()`);
  console.log('1) modal alta cliente:', JSON.stringify(r1));
  // 2) cotizar con ese cliente
  const r2=await ev(`(()=>{setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',4000);_letraReq=undefined;setRaw('Calculadora','F14',36);_plazoReq=36;refreshAll();
    return {letra:getV('Calculadora','C24'), tipo:getV('Calculadora','I2'), plazoEfect:getV('Calculadora','G14')};})()`);
  console.log('2) cotización cliente nuevo:', JSON.stringify(r2));
  // 3) editar parámetro financiera (notaría 25->100) y ver recálculo
  const r3=await ev(`(()=>{const before=getV('Calculadora','C24');setV('Calculadora','F30',100);const after=getV('Calculadora','C24');setV('Calculadora','F30',25);return {antes:before,despues:after,cambia:before!==after};})()`);
  console.log('3) editar notaría recalcula:', JSON.stringify(r3));
  // 4) renombrar tipo por financiera y verificar dropdown
  const r4=await ev(`(()=>{FINANCIERAS['1'].tipos[1]='ZAFIRO';refreshTipoSelector();const t=[...document.getElementById('inp_tipo').options].map(o=>o.textContent);return {tiene:t.some(x=>x.includes('ZAFIRO'))};})()`);
  console.log('4) renombrar tipo:', JSON.stringify(r4));
  // 5) DATOS grid + docs
  const r5=await ev(`(()=>{activeSheet='DATOS';renderGrid();const dat=document.getElementById('gridWrap').innerText.length;activeSheet='Calculadora';renderGrid();const map=document.getElementById('gridWrap').innerText;return {datosLen:dat, mapaOK:map.includes('1 · Entradas'), sinCeldasCrudas:!map.includes('celdas crudas')};})()`);
  console.log('5) DATOS y mapa:', JSON.stringify(r5));
  // 6) letra residual + tope pago auto
  const r6=await ev(`(()=>{['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k==='G11'?1:0));refreshAll();_letraMode='residual';applyLetraMode();const d8=getV('Calculadora','D8');_letraMode='deseada';applyLetraMode();return {letraResidual:d8};})()`);
  console.log('6) residual/pago-auto:', JSON.stringify(r6));
  console.log('7) errores JS acumulados:', errs.length?errs.slice(0,6):'NINGUNO');
  ws.close();
}catch(e){console.error('ERROR',String(e).slice(0,300));process.exitCode=1;}finally{proc.kill('SIGKILL');}
