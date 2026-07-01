// Genera un cotizador HTML autónomo con el motor TypeScript verificado + paneles
// de Parámetros financiera, Super Admin y Tablas de referencia (sin HyperFormula).
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const engineTs = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8');
let engineJs = stripTypeScriptTypes(engineTs, { mode: 'strip' }).replace(/^export\s+/gm, '');

const oracle = JSON.parse(readFileSync(new URL('./oracle.json', import.meta.url), 'utf8'));
const cfg = oracle.config;
cfg.pisoLetra = 5;        // N4
cfg.pctMinVoluntario = 0.74; // N6
// Umbral de plazo por clave (AH2:AK7) — para la tabla de referencia
cfg.umbral = [
  ['Contraloría', 0.30, 48, 72], ['CSS', 0.30, 48, 60], ['Gobierno', 0.26, 60, 144],
  ['Empresa Privada', 0.26, 60, 144], ['Jubilado', 0.26, 60, 144], ['Voluntario', 0.30, 96, 288],
];

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cotizador Fiflouu — motor TypeScript</title>
<style>
  :root{--verde:#16615f;--linea:#e1ebe9;--gris:#6b8088;--bg:#f4f7f6;--naranja:#9a3412}
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:var(--bg);color:#28323a}
  header{background:var(--verde);color:#fff;padding:14px 22px}
  header h1{margin:0;font-size:18px}
  header p{margin:3px 0 0;font-size:12px;opacity:.85}
  .badge{display:inline-block;background:rgba(255,255,255,.18);border-radius:20px;padding:2px 10px;font-size:11px;margin-left:6px}
  nav{background:#fff;border-bottom:1px solid var(--linea);padding:0 16px;display:flex;gap:2px;position:sticky;top:0;z-index:5;flex-wrap:wrap}
  nav button{background:none;border:none;padding:12px 14px;font-size:13px;color:var(--gris);cursor:pointer;border-bottom:2px solid transparent}
  nav button.on{color:var(--verde);border-bottom-color:var(--verde);font-weight:600}
  .page{max-width:1120px;margin:18px auto;padding:0 16px;display:none}
  .page.on{display:block}
  .grid2{display:grid;grid-template-columns:380px 1fr;gap:18px}
  @media(max-width:820px){.grid2{grid-template-columns:1fr}}
  .card{background:#fff;border:1px solid var(--linea);border-radius:12px;padding:16px;margin-bottom:16px}
  .card h2{margin:0 0 12px;font-size:14px;color:var(--verde);border-bottom:1px solid var(--linea);padding-bottom:8px}
  .card h3{font-size:12.5px;color:var(--verde);margin:16px 0 6px}
  .field{margin-bottom:10px}
  .field label{display:block;font-size:12px;color:var(--gris);margin-bottom:3px}
  .field input,.field select{width:100%;padding:7px 9px;border:1px solid #cdd8dc;border-radius:8px;font-size:14px;background:#fff}
  .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .chk{display:flex;align-items:center;gap:7px;font-size:13px;margin:6px 0}
  .chk input{width:auto}
  .hide{display:none}
  table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
  td,th{padding:5px 8px;border-bottom:1px solid #eef3f2;text-align:left}
  th{color:var(--gris);font-weight:600;font-size:11.5px}
  td.v{text-align:right;font-weight:600}
  tr.mayor td{background:#f0f7f6;color:var(--verde);font-weight:700}
  tr.fin td{border-top:2px solid var(--verde);font-weight:700;font-size:15px}
  .letra{font-size:26px;color:var(--verde);font-weight:800}
  .sub{font-size:12px;color:var(--gris)}
  .tasas{margin-top:12px;font-size:11.5px;color:var(--gris)}
  .tasas span{display:inline-block;margin-right:12px}
  .mini{width:70px;padding:3px 5px;border:1px solid #cdd8dc;border-radius:6px;font-size:12px;text-align:right;font-variant-numeric:tabular-nums}
  .mat td{padding:3px 5px}
  .xrow{background:#f0f7f6} .xcol{background:#f7fbfa} .xhit{background:#d6ebe8;font-weight:700}
  .adminbox{border:1px solid #f0c9b0;background:#fff8f3;border-radius:10px;padding:14px}
  .adminbox h2{color:var(--naranja);border-color:#f0c9b0}
  textarea{width:100%;font-family:ui-monospace,monospace;font-size:11px;border:1px solid #cdd8dc;border-radius:8px;padding:8px;min-height:120px}
  .note{font-size:11.5px;color:var(--gris);margin:4px 0 0}
</style>
</head>
<body>
<header>
  <h1>Cotizador Fiflouu <span class="badge">motor TypeScript</span> <span class="badge" id="finBadge"></span></h1>
  <p>Cálculo nativo (sin hoja de cálculo) · verificado al centavo contra el modelo original</p>
</header>
<nav>
  <button data-tab="cot" class="on">Cotización</button>
  <button data-tab="fin">Parámetros financiera</button>
  <button data-tab="sa">Super Admin</button>
  <button data-tab="ref">Tablas de referencia</button>
</nav>

<!-- ============ COTIZACIÓN ============ -->
<div class="page on" id="pg_cot"><div class="grid2">
  <div class="card">
    <h2>Datos de la cotización</h2>
    <div class="field"><label>Modo</label><select id="modo">
      <option value="monto">Por monto</option><option value="letra">Por letra quincenal</option>
      <option value="capacidad">Por capacidad máxima</option></select></div>
    <div class="field" id="f_monto"><label>Monto solicitado ($)</label><input id="monto" type="number" value="5000" step="100"></div>
    <div class="field hide" id="f_letra"><label>Letra quincenal ($)</label><input id="letra" type="number" value="150" step="1"></div>
    <div class="row2">
      <div class="field"><label>Plazo (cuotas)</label><input id="plazo" type="number" value="36"></div>
      <div class="field"><label>Tipo de cliente</label><select id="tipo"></select></div>
    </div>
    <div class="row2">
      <div class="field"><label>Promotor</label><select id="prom"></select></div>
      <div class="field"><label>Clave de descuento</label><select id="clave"></select></div>
    </div>
    <div class="chk"><input id="esCSS" type="checkbox"><label for="esCSS">CSS (Pago Automático)</label></div>
    <div class="chk"><input id="af1" type="checkbox"><label for="af1">ITBMS fuera</label></div>
    <div class="chk"><input id="af10" type="checkbox"><label for="af10">Interés compuesto</label></div>
    <div class="row2">
      <div class="field"><label>Refinanciamiento ($)</label><input id="refi" type="number" value="0"></div>
      <div class="field"><label>Cancelación terceros ($)</label><input id="terceros" type="number" value="0"></div>
    </div>
    <div class="chk"><input id="jub" type="checkbox" checked><label for="jub">Aplica tope por jubilación</label></div>
    <div class="row2" id="f_jub">
      <div class="field"><label>Fecha de nacimiento</label><input id="fnac" type="date" value="1990-01-15"></div>
      <div class="field"><label>Género</label><select id="genero"><option>Masculino</option><option>Femenino</option></select></div>
    </div>
    <div id="f_cliente" class="hide">
      <h3>Datos del cliente (capacidad)</h3>
      <div class="row2"><div class="field"><label>Salario mensual ($)</label><input id="c_sal" type="number" value="1500"></div>
        <div class="field"><label>Desc. comercial ($)</label><input id="c_desc" type="number" value="100"></div></div>
      <div class="row2"><div class="field"><label>Clave N-147 ($)</label><input id="c_n147" type="number" value="0"></div>
        <div class="field"><label>Embargos ($)</label><input id="c_emb" type="number" value="0"></div></div>
      <div class="field"><label>Descontable mensual ($)</label><input id="c_descontable" type="number" value="1200"></div>
    </div>
  </div>
  <div class="card">
    <h2>Resultado</h2>
    <div class="sub">Letra quincenal</div><div class="letra" id="r_letra">—</div>
    <div class="sub" id="r_cuotas"></div>
    <table id="r_tabla"></table>
    <div class="tasas" id="r_tasas"></div>
  </div>
</div></div>

<!-- ============ PARÁMETROS FINANCIERA ============ -->
<div class="page" id="pg_fin"><div class="card" id="finWrap"></div></div>

<!-- ============ SUPER ADMIN ============ -->
<div class="page" id="pg_sa"><div class="adminbox" id="saWrap"></div></div>

<!-- ============ TABLAS DE REFERENCIA ============ -->
<div class="page" id="pg_ref"><div class="card" id="refWrap"></div></div>

<script type="module">
// ======================= MOTOR (TypeScript sin tipos) =======================
${engineJs}
// ======================= CONFIG GLOBAL (parámetros financiera) =======================
const CFG = ${JSON.stringify(cfg)};
const CLAVES = {G8:'Empresa Privada',G9:'Jubilado',G10:'Gobierno',G11:'Pago Automático',G12:'Descuento Voluntario'};
const PROMS = {1:'Completo',2:'Media',3:'Baja',4:'Sin Comisión',5:'Referido $100'};
const TIPO_DEF = {1:'Diamante',2:'Platinum',3:'Premium',4:'24-59 meses',5:'0-23 meses',6:'Recien Nombrado',7:'Eventual'};
// ======================= MULTI-FINANCIERA (Super Admin) =======================
function mkFin(){ return { claves:{G8:true,G9:true,G10:true,G11:true,G12:true},
  prom:{1:true,2:true,3:true,4:true,5:true}, tipos:{...TIPO_DEF} }; }
const FIN = {'1':mkFin(),'2':mkFin(),'3':mkFin(),'4':mkFin(),'5':mkFin()};
let ACT = '1';
const fin = () => FIN[ACT];
const tipoNombre = c => (fin().tipos[c]||TIPO_DEF[c]);

const $ = id => document.getElementById(id);
const money = v => '$' + (Number(v)||0).toLocaleString('es-PA',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct = v => (Number(v)*100).toLocaleString('es-PA',{minimumFractionDigits:2,maximumFractionDigits:2}) + '%';
const serial = s => { const [y,m,d]=s.split('-').map(Number); return Math.round((Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/86400000); };
const hoy = () => { const d=new Date(); return Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(1899,11,30))/86400000); };

// -------- pestañas --------
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('nav button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  $('pg_'+b.dataset.tab).classList.add('on');
  if(b.dataset.tab==='fin') renderFin();
  if(b.dataset.tab==='sa') renderSA();
  if(b.dataset.tab==='ref') renderRef();
}));

// -------- selectores dependientes de la financiera activa --------
function fillSelectors(){
  const st=$('tipo'), sp=$('prom'), sc=$('clave');
  const kt=st.value, kp=sp.value, kc=sc.value;
  st.innerHTML=''; for(let c=1;c<=7;c++){const o=document.createElement('option');o.value=c;o.textContent=c+' · '+tipoNombre(c);st.appendChild(o);}
  sp.innerHTML=''; Object.keys(PROMS).forEach(i=>{ if(fin().prom[i]){const o=document.createElement('option');o.value=i;o.textContent=PROMS[i];sp.appendChild(o);} });
  sc.innerHTML=''; Object.keys(CLAVES).forEach(g=>{ if(fin().claves[g]){const o=document.createElement('option');o.value=g;o.textContent=CLAVES[g];sc.appendChild(o);} });
  st.value = (kt>='1'&&kt<='7') ? kt : '3';
  if(kp&&fin().prom[kp]) sp.value=kp; if(kc&&fin().claves[kc]) sc.value=kc;
  $('finBadge').textContent='Financiera '+ACT;
}

// -------- cotización --------
function calcular(){
  const modo=$('modo').value;
  $('f_monto').classList.toggle('hide', modo!=='monto');
  $('f_letra').classList.toggle('hide', modo!=='letra');
  $('f_cliente').classList.toggle('hide', modo!=='capacidad');
  $('f_jub').classList.toggle('hide', !$('jub').checked);
  const inp={ plazo:+$('plazo').value, tipoCode:+($('tipo').value||3), promotorIdx:+($('prom').value||1),
    promotorNoTiene:false, clave:$('clave').value||'G8', esCSS:$('esCSS').checked,
    refi:+$('refi').value, terceros:+$('terceros').value, itbmsFuera:$('af1').checked, interesCompuesto:$('af10').checked,
    fnacSerial:serial($('fnac').value), genero:$('genero').value, todaySerial:hoy() };
  if(!$('jub').checked) inp.fnacSerial = hoy() - 25*365;
  let r;
  try{
    if(modo==='monto'){ inp.monto=+$('monto').value; r=cotizarPorMonto(inp,CFG); }
    else if(modo==='letra'){ inp.letra=+$('letra').value; r=cotizarPorLetra(inp,CFG); }
    else { const f={salario:+$('c_sal').value,descComercial:+$('c_desc').value,claveN147:+$('c_n147').value,embargos:+$('c_emb').value,descontable:+$('c_descontable').value}; r=cotizarPorCapacidad(f,inp,CFG); }
  }catch(e){ $('r_letra').textContent='—'; return; }
  $('r_letra').textContent=money(r.letraQuincenal);
  $('r_cuotas').textContent=r.cuotas+' cuotas · '+(r.cuotas*2)+' quincenas';
  const rows=[['mayor','Monto Total de Obligación',r.totalPagar],['','Menos Intereses',r.interes],
    ['','Gastos Notariales',r.notaria],['','FECI',r.feci],['','ITBMS',r.itbms],
    ['','Servicio de Descuento',r.servicioDescuento],['','Comisión Promotor',r.comisionPromotor],
    ['','Comisión Administrativa',r.comisionAdmin],['','Timbres',r.timbres],
    ['mayor','Monto Obligación Neta',r.montoNeta],['','Menos Refinanciamiento',inp.refi||0],
    ['','Cancelación a Terceros',inp.terceros||0],['fin','Monto Recibido en Mano',r.sumaARecibir]];
  $('r_tabla').innerHTML=rows.map(([c,l,v])=>'<tr class="'+c+'"><td>'+l+'</td><td class="v">'+money(v)+'</td></tr>').join('');
  $('r_tasas').innerHTML='<span>Interés: <b>'+pct(r.tasaInteresMensual)+'</b></span><span>Com. admin: <b>'+pct(r.tasaComAdmin)+'</b></span><span>Com. promotor: <b>'+pct(r.tasaComPromotor)+'</b></span><span>Servicio: <b>'+pct(r.tasaServicio)+'</b></span>';
}

// -------- Parámetros financiera (edita CFG global) --------
const PROM_COLS=['Completo','Media','Baja','Sin Com.','Referido'];
function matEdit(title, key){
  let h='<h3>'+title+'</h3><table class="mat"><tr><th>Tipo de cliente</th>'+PROM_COLS.map(c=>'<th>'+c+'</th>').join('')+'</tr>';
  for(let r=0;r<6;r++){ h+='<tr><td>'+tipoNombre(r+1)+'</td>'+CFG[key][r].map((v,c)=>'<td><input class="mini" type="number" step="0.001" data-mat="'+key+'" data-r="'+r+'" data-c="'+c+'" value="'+(+(v*100).toFixed(4))+'"><small>%</small></td>').join('')+'</tr>'; }
  return h+'</table>';
}
function renderFin(){
  const c=CFG;
  let h='<h2>Parámetros de la Financiera '+ACT+'</h2><p class="note">Los cambios recalculan la cotización al instante.</p>';
  h+='<h3>Cargos, impuestos y notaría</h3><div class="row2">'
    +sc('ITBMS','itbmsRate',100,'%')+sc('FECI','feciRate',100,'%')+sc('Timbres','timbresRate',100,'')+sc('Notaría ($)','notaria',1,'$')+'</div>';
  h+='<h3>Pisos</h3><div class="row2">'+sc('Piso de letra ($)','pisoLetra',1,'$')+sc('% mín. Voluntario','pctMinVoluntario',100,'%')+'</div>';
  h+='<h3>Edad de jubilación</h3><div class="row2">'+sc('Mujer (años)','edadJubMujer',1,'')+sc('Hombre (años)','edadJubHombre',1,'')+'</div>';
  h+='<h3>Plazo máximo por tipo de cliente</h3><table><tr><th>Tipo</th><th>Plazo máx (meses)</th></tr>';
  for(let t=1;t<=7;t++) h+='<tr><td>'+tipoNombre(t)+'</td><td><input class="mini" type="number" data-plazo="'+(t-1)+'" value="'+c.tipoMaxPlazo[t-1]+'"></td></tr>';
  h+='</table>';
  h+='<h3>Matrices tarifarias (fila = tipo · columna = promotor)</h3>';
  h+=matEdit('Comisión','matrizComision')+matEdit('Interés','matrizInteres')+matEdit('Gasto de cierre / Comisión administrativa','matrizGastoCierre');
  $('finWrap').innerHTML=h;
  $('finWrap').querySelectorAll('[data-scalar]').forEach(inp=>inp.addEventListener('input',()=>{ CFG[inp.dataset.scalar]=(+inp.value)/(+inp.dataset.sc); calcular(); }));
  $('finWrap').querySelectorAll('[data-plazo]').forEach(inp=>inp.addEventListener('input',()=>{ CFG.tipoMaxPlazo[+inp.dataset.plazo]=+inp.value; calcular(); }));
  $('finWrap').querySelectorAll('[data-mat]').forEach(inp=>inp.addEventListener('input',()=>{ CFG[inp.dataset.mat][+inp.dataset.r][+inp.dataset.c]=(+inp.value)/100; calcular(); renderRef(); }));
}
function sc(lab,key,scale,suf){ return '<div class="field"><label>'+lab+(suf?' ('+suf+')':'')+'</label><input class="" type="number" step="0.01" data-scalar="'+key+'" data-sc="'+scale+'" value="'+(+(CFG[key]*scale).toFixed(4))+'"></div>'; }

// -------- Super Admin --------
function renderSA(){
  let h='<h2>🔒 Super Admin · configuración por financiera</h2>';
  h+='<div class="field"><label>Financiera actual</label><select id="saFin">'+Object.keys(FIN).map(id=>'<option'+(id===ACT?' selected':'')+'>'+id+'</option>').join('')+'</select></div>';
  h+='<h3>Claves de descuento</h3>'+Object.keys(CLAVES).map(g=>'<label class="chk"><input type="checkbox" data-sacl="'+g+'"'+(fin().claves[g]?' checked':'')+'> '+CLAVES[g]+'</label>').join('');
  h+='<h3>Promotores</h3>'+Object.keys(PROMS).map(i=>'<label class="chk"><input type="checkbox" data-sapr="'+i+'"'+(fin().prom[i]?' checked':'')+'> '+PROMS[i]+'</label>').join('');
  h+='<h3>Nombres de tipos de cliente</h3><p class="note">El código (1–7) es fijo; el nombre es solo etiqueta visible de esta financiera.</p>';
  for(let t=1;t<=7;t++) h+='<div class="field"><label>Tipo '+t+'</label><input type="text" data-satipo="'+t+'" value="'+tipoNombre(t).replace(/"/g,'&quot;')+'"></div>';
  h+='<h3>Exportar configuración</h3><textarea id="saExport" readonly></textarea>';
  $('saWrap').innerHTML=h;
  const apply=()=>{ fillSelectors(); calcular(); updateExport(); };
  $('saFin').addEventListener('change',e=>{ ACT=e.target.value; renderSA(); apply(); });
  $('saWrap').querySelectorAll('[data-sacl]').forEach(cb=>cb.addEventListener('change',()=>{ fin().claves[cb.dataset.sacl]=cb.checked; apply(); }));
  $('saWrap').querySelectorAll('[data-sapr]').forEach(cb=>cb.addEventListener('change',()=>{ fin().prom[cb.dataset.sapr]=cb.checked; apply(); }));
  $('saWrap').querySelectorAll('[data-satipo]').forEach(inp=>inp.addEventListener('input',()=>{ fin().tipos[inp.dataset.satipo]=inp.value; fillSelectors(); calcular(); updateExport(); }));
  updateExport();
}
function updateExport(){
  const ta=$('saExport'); if(!ta) return;
  const lines=Object.keys(FIN).map(id=>{const m=FIN[id];
    const cl=Object.keys(CLAVES).map(g=>g+':'+!!m.claves[g]).join(', ');
    const pr=Object.keys(PROMS).map(i=>i+':'+!!m.prom[i]).join(', ');
    const tp=[1,2,3,4,5,6,7].map(t=>t+":'"+String(m.tipos[t]).replace(/'/g,"\\\\'")+"'").join(', ');
    return "  '"+id+"': { claves:{ "+cl+" }, prom:{ "+pr+" }, tipos:{ "+tp+" } }";}).join(',\\n');
  ta.value='const FINANCIERAS = {\\n'+lines+'\\n};';
}

// -------- Tablas de referencia (solo lectura) --------
function refMat(title, key, resolved){
  let h='<h3>'+title+'</h3><table class="mat"><tr><th>Tipo</th>'+PROM_COLS.map(c=>'<th>'+c+'</th>').join('')+'</tr>';
  const tAct=+($('tipo').value||3), pAct=+($('prom').value||1);
  for(let r=0;r<6;r++){ h+='<tr>'+'<td'+(r+1===tAct?' class="xrow"':'')+'>'+tipoNombre(r+1)+'</td>'
    +CFG[key][r].map((v,c)=>{const hit=(r+1===tAct&&c+1===pAct);return '<td class="'+(hit?'xhit':(c+1===pAct?'xcol':(r+1===tAct?'xrow':'')))+'">'+pct(v)+'</td>';}).join('')+'</tr>'; }
  return h+'</table>';
}
function renderRef(){
  const tAct=+($('tipo').value||3), pAct=+($('prom').value||1);
  let h='<h2>Tablas de referencia</h2><p class="note">Cruce vigente: <b>'+tipoNombre(tAct)+'</b> (tipo '+tAct+') × <b>'+PROMS[pAct]+'</b>.</p>';
  h+='<h3>Plazo máximo por tipo de cliente</h3><table><tr><th>Código</th><th>Tipo</th><th>Plazo máx (meses)</th></tr>';
  for(let t=1;t<=7;t++) h+='<tr class="'+(t===tAct?'xrow':'')+'"><td>'+t+'</td><td>'+tipoNombre(t)+'</td><td class="v">'+CFG.tipoMaxPlazo[t-1]+'</td></tr>';
  h+='</table>';
  h+='<h3>Umbral de plazo por clave</h3><table><tr><th>Clave</th><th>Porcentaje</th><th>Meses</th><th>Meses máx</th></tr>'
    +CFG.umbral.map(u=>'<tr><td>'+u[0]+'</td><td>'+pct(u[1])+'</td><td>'+u[2]+'</td><td>'+u[3]+'</td></tr>').join('')+'</table>';
  h+='<h3>Matrices tarifarias</h3>'+refMat('Comisión','matrizComision')+refMat('Interés','matrizInteres')+refMat('Gasto de cierre / Comisión administrativa','matrizGastoCierre');
  h+='<h3>Otros parámetros</h3><table>'
    +'<tr><td>ITBMS</td><td class="v">'+pct(CFG.itbmsRate)+'</td></tr>'
    +'<tr><td>FECI</td><td class="v">'+pct(CFG.feciRate)+'</td></tr>'
    +'<tr><td>Timbres</td><td class="v">'+CFG.timbresRate+'</td></tr>'
    +'<tr><td>Notaría</td><td class="v">'+money(CFG.notaria)+'</td></tr>'
    +'<tr><td>Piso de letra</td><td class="v">'+money(CFG.pisoLetra)+'</td></tr>'
    +'<tr><td>Edad jubilación (M/H)</td><td class="v">'+CFG.edadJubMujer+' / '+CFG.edadJubHombre+'</td></tr></table>';
  $('refWrap').innerHTML=h;
}

// -------- arranque --------
fillSelectors();
document.querySelectorAll('#pg_cot input,#pg_cot select').forEach(el=>{ el.addEventListener('input',calcular); el.addEventListener('change',calcular); });
calcular();
</script>
</body>
</html>`;

writeFileSync(new URL('../Cotizador_Fiflouu__motor-TS.html', import.meta.url), html);
console.log('HTML generado (' + html.length + ' bytes)');
