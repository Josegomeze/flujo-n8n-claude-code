// Verifica el cotizador HTML contra las cotizaciones VIGENTES extraídas del portal
// (dataset: vigentes.json, extracción única de zonasegura — solo lectura).
// Tolerancias acordadas: ±$0.10 por rubro; Notaría hasta ±$2.00.
// Uso: node verify_vigentes.mjs [ruta_al_html] [puerto_cdp]
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const SC = dirname(fileURLToPath(import.meta.url));
const HTML=process.argv[2]||'/home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v85.html';
const PORT=+(process.argv[3]||9480);
const D=JSON.parse(readFileSync(SC+'/vigentes.json','utf8'));
const f=(v)=>{const x=parseFloat(v);return isNaN(x)?null:x;};
// limpieza: celdas corruptas de la extracción (seriales de fecha u otros desbordes)
function clean(q){
  const o={id:q.id, fecha:f(q.fecha), prod:q.producto, cat:q.categoria_patrono, prom:q.promotor,
    monto:f(q.monto_solicitado), plazoQ:f(q.plazo_cuotas), meses:f(q.meses_financiamiento),
    p1:f(q.primer_pago), refi:f(q.refinanciamiento)||0, terc:f(q.cancelacion_terceros)||0,
    letra:f(q.letra_quincenal), total:f(q.total_pagar), int:f(q.intereses), feci:f(q.feci),
    notaria:f(q.notaria), serv:f(q.servicio_descuento), promC:f(q.comision_promotor),
    adm:f(q.comision_admin_manejo), timb:f(q.timbres), neta:f(q.obligacion_neta),
    itbms:f(q.itbms), rec:f(q.recibido_en_mano)};
  const bad=[];
  if(o.notaria!=null && o.notaria>500){bad.push('notaria');o.notaria=null;}
  if(o.letra!=null && o.total!=null && Math.abs(o.letra*o.plazoQ-o.total)>1){ // letra corrupta -> derivar de total
    bad.push('letra(derivada=total/n)'); o.letra=+(o.total/o.plazoQ).toFixed(2); }
  if(o.adm!=null && o.neta!=null && o.neta<100000 && o.adm>o.neta){bad.push('adm');o.adm=null;}
  if(o.neta!=null && o.total!=null && o.neta>o.total*2){bad.push('neta');o.neta=null;}
  if(o.itbms!=null && o.itbms>5000){bad.push('itbms');o.itbms=null;}
  if(o.adm!=null && o.adm>100000){bad.push('adm');o.adm=null;}
  if(o.feci!=null && o.feci>5000){bad.push('feci');o.feci=null;}
  if(o.total!=null && o.neta!=null && o.int!=null && o.total > 3*(o.neta+o.int)+5000){bad.push('total');o.total=null;o.letra=f(q.letra_quincenal)>10000?null:o.letra;}
  if(o.letra!=null && o.letra>10000){bad.push('letra');o.letra=null;}
  o.bad=bad; return o;
}
const Q=D.map(clean);
function inferTipo(q){
  const cuotas=q.plazoQ/2;
  if(q.prod==='Descuento Directo'){
    // Diamante: interés 1% (o admin 35%)
    if(q.neta&&q.int&&q.meses){ const r=q.int/(q.neta*q.meses); if(Math.abs(r-0.01)<0.002) return 1; if(Math.abs(r-0.02)<0.002) return 2; }
    if(q.neta&&q.adm){ const a=q.adm/q.neta; if(Math.abs(a-0.35)<0.01) return 1; }
    return cuotas>132?1:2; // Diamante si excede Platinum
  }
  if(q.prod==='Pago Voluntario') return cuotas>132?1:2;
  return 2; // Débito: indistinto (tasas planas)
}
async function run(){
  const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
  const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'about:blank'],{stdio:'ignore'});
  let id=0;const pend=new Map();const errs=[];
  let target=null;for(let i=0;i<50;i++){try{const j=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errs.push((m.params.exceptionDetails.exception?.description||'').split('\n')[0]);});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails.exception).slice(0,250));return r.result.result.value;};
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:'file://'+HTML});
  for(let i=0;i<100;i++){await sleep(200);try{if(await ev(`typeof refreshAll==='function'`))break;}catch(e){}}
  await sleep(300);
  const out=[];
  for(const q of Q){
    const cuotas=q.plazoQ/2;
    const tipo=inferTipo(q);
    const clave=q.prod==='Debito Automatico'?'G11':(q.prod==='Pago Voluntario'?'G12':'G10');
    const esCSS=/CSS/i.test(q.cat)&&clave==='G11';
    const promTier=(q.prom==='Sin Promotor')?'Sin Comision':'Completo';
    const byLetra = Number.isInteger(q.letra) || Math.abs(q.letra*4-Math.round(q.letra*4))<1e-9 && q.prod!=='Descuento Directo';
    const D2=+(q.rec+q.refi+q.terc).toFixed(2);
    const r=await ev(`(()=>{
      ['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k===${JSON.stringify(clave)}?1:0));
      setRaw('Calculadora','B11',${JSON.stringify(esCSS?'Caja de Seguro Social':(q.cat||'Contraloria'))});
      setRaw('Calculadora','I1',${JSON.stringify(promTier)});
      setRaw('Calculadora','I2','Tipo Cliente ${tipo}');
      setRaw('Calculadora','J6','NO');
      setRaw('Motor','J12',${q.p1});
      setRaw('Calculadora','F17',${q.refi});setRaw('Calculadora','F18',${q.terc});
      ${byLetra?`setRaw('Calculadora','D2',0);setRaw('Calculadora','D8',${q.letra});`:`setRaw('Calculadora','D8',0);setRaw('Calculadora','D2',${D2});`}
      setRaw('Calculadora','F14',${cuotas});
      const g=(a)=>{const v=getV('Calculadora',a);return (v&&typeof v==='object')?null:v;};
      return {letra:g('C24'),total:g('G33'),int:g('F23'),feci:g('F31'),notaria:g('F30'),serv:g('F27'),promC:g('F26'),adm:g('F25'),timb:g('F28'),neta:g('G21'),itbms:g('F20'),rec:g('F16'),meses:g('H14')};
    })()`);
    out.push({q,tipo,clave,promTier,byLetra,v:r});
  }
  proc.kill('SIGKILL');
  return {out,errs};
}
const {out,errs}=await run();
const FIELDS=[['letra','letra',0.10],['total','total',0.10],['int','int',0.10],['feci','feci',0.10],['notaria','notaria',2.00],['serv','serv',0.10],['promC','promC',0.10],['adm','adm',0.10],['timb','timb',0.10],['neta','neta',0.10],['itbms','itbms',0.10],['rec','rec',0.10],['meses','meses',0.01]];
let totF=0, okF=0; const rows=[];
for(const {q,tipo,clave,promTier,byLetra,v} of out){
  const diffs=[];
  for(const [pk,vk,tol] of FIELDS){
    const pv=q[pk], mv=v[vk];
    if(pv==null||mv==null) continue;
    totF++;
    const d=mv-pv;
    if(Math.abs(d)<=tol) okF++;
    else diffs.push(`${pk}: portal=${pv} v=${(+mv).toFixed(2)} d=${d>0?'+':''}${d.toFixed(2)}`);
  }
  rows.push({id:q.id,prod:q.prod.slice(0,4),tipo,promTier:promTier.slice(0,4),byLetra,diffs,bad:q.bad});
  if(diffs.length) console.log(`✗ ${q.id} [${q.prod.slice(0,14)} t${tipo} ${promTier.slice(0,8)} ${byLetra?'letra':'monto'}] -> ${diffs.join(' | ')}`);
}
const exact=rows.filter(r=>!r.diffs.length).length;
console.log(`\n===== RONDA: cotizaciones OK ${exact}/${rows.length} | rubros OK ${okF}/${totF} =====`);
console.log('errores JS:', errs.length?errs.slice(0,3):'ninguno');
writeFileSync(SC+'/ronda_result.json', JSON.stringify(out.map(({q,tipo,clave,promTier,byLetra,v})=>({q,tipo,clave,promTier,byLetra,v})),null,0));
