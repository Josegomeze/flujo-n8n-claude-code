// Generador de "oráculo": maneja la hoja real (HyperFormula) headless y vuelca casos
// {entradas -> salidas} barriendo modo (monto / letra / capacidad), las 5 claves,
// toggles (ITBMS fuera / interés compuesto), refinanciamiento y jubilación.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const BIN='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const FILE='file:///home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html';
const OUT='/home/user/flujo-n8n-claude-code/quote-engine/oracle.json';
const PORT=9337;

const proc=spawn(BIN,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'about:blank'],{stdio:'ignore'});
function rpc(ws){let id=0;const p=new Map();ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}});return (m,pr={})=>new Promise(res=>{const i=++id;p.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:pr}));});}
async function ev(send,expr){const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result&&r.result.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails.exception||r.result.exceptionDetails));return r.result.result.value;}

const OUTCELLS=['F16','F17','F18','F19','F20','F23','F25','F26','F27','F28','F30','F31','G21','G33','C24','C26','G14','H23','H25','H26','H27','H28','H31','H32','H33','AF11','J2'];
const promNames={1:'Completo',2:'Media',3:'Baja',4:'Sin Comision',5:'Referido $100'};

function caseExpr(ced,c,I3def,I4def){
  const setVal = c.mode==='monto' ? `setRaw('Calculadora','D8',0); setRaw('Calculadora','D2', ${c.valor});`
               : c.mode==='letra' ? `setRaw('Calculadora','D2',0); setRaw('Calculadora','D8', ${c.valor});`
                                   : `setRaw('Calculadora','D2',0); setRaw('Calculadora','D8',0);`;
  const finSet = c.fin ? `setRaw('Calculadora','F2',${c.fin.F2});setRaw('Calculadora','F3',${c.fin.F3});setRaw('Calculadora','F4',${c.fin.F4});setRaw('Calculadora','F5',${c.fin.F5});setRaw('Calculadora','F6',${c.fin.F6});` : '';
  const b11Set = c.clave==='G11' ? `setRaw('Calculadora','B11', ${JSON.stringify(c.esCSS?'Caja de Seguro Social':'Contraloria General')});` : '';
  const fnac = c.fnac ?? I3def, gen = c.genero ?? I4def;
  return `(()=>{
    setRaw('Calculadora','F1', ${JSON.stringify(ced)});
    ['G8','G9','G10','G11','G12'].forEach(k=>setRaw('Calculadora',k,k===${JSON.stringify(c.clave)}?1:0));
    setRaw('Calculadora','I1', ${JSON.stringify(promNames[c.prom])});
    setRaw('Calculadora','I2','Tipo Cliente ${c.tipo}');
    setRaw('Calculadora','I3', ${fnac}); setRaw('Calculadora','I4', ${JSON.stringify(gen)});
    setRaw('Calculadora','AF1', ${c.af1}); setRaw('Calculadora','AF10', ${c.af10});
    ${b11Set}${finSet}
    ${setVal}
    setRaw('Calculadora','F14', ${c.plazo});
    setRaw('Calculadora','F17', ${c.refi}); setRaw('Calculadora','F18', ${c.terceros});
    const out={}; ${JSON.stringify(OUTCELLS)}.forEach(a1=>{const v=getV('Calculadora',a1); out[a1]=(v&&typeof v==='object')?('ERR:'+v.value):v;});
    const fin={F2:getV('Calculadora','F2'),F3:getV('Calculadora','F3'),F4:getV('Calculadora','F4'),F5:getV('Calculadora','F5'),F6:getV('Calculadora','F6')};
    return {out, promotorNoTiene:(String(getV('Motor','B6'))==='No tiene'), fin};
  })()`;
}

try{
  let target=null;for(let i=0;i<40;i++){try{const j=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();target=j.find(t=>t.type==='page');if(target)break;}catch(e){}await sleep(250);}
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const send=rpc(ws);await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:FILE});
  for(let i=0;i<120;i++){await sleep(250);try{if(await ev(send,`typeof getV==='function'&&typeof setRaw==='function'&&!!document.getElementById('cedSelect')`))break;}catch(e){}}

  const config=await ev(send,`(()=>{
    const g=(a1)=>getV('Calculadora',a1);
    const mat=(r0)=>{const M=[];for(let r=r0;r<r0+6;r++){M.push(['L','M','N','O','P'].map(c=>g(c+r)));}return M;};
    return { matrizComision:mat(45), matrizInteres:mat(53), matrizGastoCierre:mat(61),
      matrizComisionVol:mat(94), matrizInteresVol:mat(102), matrizGastoCierreVol:mat(110),
      itbmsRate:g('Y23'), timbresRate:g('Y25'), feciRate:g('Y26'), notaria:g('F30'), amCap:144,
      servicioRate:{G8:g('AF6'),G9:g('AF7'),G10:g('AF5'),G11_CSS:g('AF4'),G11:g('AF3'),G12:g('AF8')},
      tipoMaxPlazo:[1,2,3,4,5,6,7].map(c=>g('R'+(20+c))),
      jubilaAplica:(String(g('J6'))==='SI'), edadJubMujer:g('AI17'), edadJubHombre:g('AI18') };
  })()`);
  const ced=await ev(send,`(()=>{const s=document.getElementById('cedSelect');return s&&s.options.length?s.options[0].value:null;})()`);
  const def=await ev(send,`(()=>({I3:getV('Calculadora','I3'),I4:getV('Calculadora','I4'),I5:getV('Calculadora','I5'),I6:getV('Calculadora','I6')}))()`);
  const todaySerial=Math.round(def.I5 - def.I6/12*365.25);

  const specs=[];
  const push=(o)=>specs.push({af1:0,af10:0,refi:0,terceros:0,fnac:null,genero:null,fin:null,esCSS:false,...o});
  for(let t=1;t<=7;t++) for(let p=1;p<=5;p++) for(const pl of [18,36,60]){
    for(const m of [2500,8000]) push({mode:'monto',valor:m,tipo:t,prom:p,plazo:pl,clave:'G8'});
    for(const l of [100,400]) push({mode:'letra',valor:l,tipo:t,prom:p,plazo:pl,clave:'G8'});
  }
  for(const cl of ['G8','G9','G10','G12']) for(const [af1,af10] of [[0,0],[1,0],[0,1],[1,1]])
    for(const t of [1,3,6,7]) for(const p of [1,3,5]) for(const pl of [24,48]){
      push({mode:'monto',valor:5000,tipo:t,prom:p,plazo:pl,clave:cl,af1,af10});
      push({mode:'letra',valor:200,tipo:t,prom:p,plazo:pl,clave:cl,af1,af10});
    }
  // Pago Automático (G11) en el cuerpo: CSS y Contraloría
  for(const esCSS of [false,true]) for(const t of [1,3,6]) for(const p of [1,3]) for(const pl of [36,72]){
    push({mode:'monto',valor:5000,tipo:t,prom:p,plazo:pl,clave:'G11',esCSS});
    push({mode:'letra',valor:80,tipo:t,prom:p,plazo:pl,clave:'G11',esCSS});
  }
  for(const refi of [0,1000,3000]) for(const terc of [0,500]) for(const t of [3,6]){
    push({mode:'monto',valor:9000,tipo:t,prom:1,plazo:36,clave:'G8',refi,terceros:terc});
    push({mode:'letra',valor:300,tipo:t,prom:1,plazo:36,clave:'G8',refi,terceros:terc});
  }
  for(const genero of ['Masculino','Femenino']){
    const edadRet = genero==='Femenino'? config.edadJubMujer : config.edadJubHombre;
    for(const meses of [12,30,48,120]){
      const fnac = Math.round(todaySerial + (meses/12 - edadRet)*365.25);
      push({mode:'monto',valor:6000,tipo:1,prom:1,plazo:60,clave:'G8',fnac,genero});
      push({mode:'letra',valor:250,tipo:1,prom:1,plazo:60,clave:'G8',fnac,genero});
    }
  }
  for(const clave of ['G8','G9','G10','G12']) for(const F2 of [1000,1800,3000]) for(const F6 of [1200,3500])
    for(const t of [3,6]) for(const p of [1,3])
      push({mode:'capacidad',valor:0,tipo:t,prom:p,plazo:48,clave, fin:{F2,F3:100,F4:0,F5:0,F6}});

  const cases=[];
  for(const s of specs){
    const rec=await ev(send, caseExpr(ced,s,def.I3,def.I4));
    const inp={plazo:s.plazo,tipoCode:s.tipo,promotorIdx:s.prom,clave:s.clave,esCSS:s.esCSS,
               promotorNoTiene:rec.promotorNoTiene,refi:s.refi,terceros:s.terceros,
               itbmsFuera:!!s.af1, interesCompuesto:!!s.af10,
               fnacSerial:(s.fnac ?? def.I3), genero:(s.genero ?? def.I4), todaySerial};
    if(s.mode==='monto') inp.monto=s.valor; else if(s.mode==='letra') inp.letra=s.valor;
    const c={mode:s.mode, in:inp, out:rec.out};
    if(s.mode==='capacidad') c.fin={salario:rec.fin.F2,descComercial:rec.fin.F3,claveN147:rec.fin.F4,embargos:rec.fin.F5,descontable:rec.fin.F6};
    cases.push(c);
  }
  writeFileSync(OUT, JSON.stringify({meta:{ced,source:'sheet v76',n:cases.length,todaySerial}, config, cases}));
  const withErr=cases.filter(c=>Object.values(c.out).some(v=>typeof v==='string'&&String(v).startsWith('ERR:')));
  const nMode=m=>cases.filter(c=>c.mode===m).length;
  console.log('Oráculo:', cases.length, `(monto ${nMode('monto')}, letra ${nMode('letra')}, capacidad ${nMode('capacidad')}) | con error:`, withErr.length);
  ws.close();
}catch(e){console.error('ERROR',e);process.exitCode=1;}finally{proc.kill('SIGKILL');}
