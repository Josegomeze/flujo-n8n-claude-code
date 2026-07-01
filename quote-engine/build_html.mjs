// Genera un cotizador HTML autónomo que usa el motor TypeScript verificado.
// Incrusta el motor (sin tipos) + la configuración de la financiera + una interfaz.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const engineTs = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8');
let engineJs = stripTypeScriptTypes(engineTs, { mode: 'strip' });
engineJs = engineJs.replace(/^export\s+/gm, ''); // quitar 'export' para uso en módulo inline

const oracle = JSON.parse(readFileSync(new URL('./oracle.json', import.meta.url), 'utf8'));
const cfg = oracle.config;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cotizador Fiflouu — motor TypeScript</title>
<style>
  :root{--verde:#16615f;--linea:#e1ebe9;--gris:#6b8088;--bg:#f4f7f6}
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:var(--bg);color:#28323a}
  header{background:var(--verde);color:#fff;padding:16px 22px}
  header h1{margin:0;font-size:19px}
  header p{margin:4px 0 0;font-size:12px;opacity:.85}
  .wrap{max-width:1120px;margin:18px auto;padding:0 16px;display:grid;grid-template-columns:380px 1fr;gap:18px}
  @media(max-width:820px){.wrap{grid-template-columns:1fr}}
  .card{background:#fff;border:1px solid var(--linea);border-radius:12px;padding:16px}
  .card h2{margin:0 0 12px;font-size:14px;color:var(--verde);border-bottom:1px solid var(--linea);padding-bottom:8px}
  .field{margin-bottom:10px}
  .field label{display:block;font-size:12px;color:var(--gris);margin-bottom:3px}
  .field input,.field select{width:100%;padding:7px 9px;border:1px solid #cdd8dc;border-radius:8px;font-size:14px;background:#fff}
  .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .chk{display:flex;align-items:center;gap:7px;font-size:13px;margin:6px 0}
  .chk input{width:auto}
  .hide{display:none}
  table.res{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
  table.res td{padding:5px 8px;border-bottom:1px solid #eef3f2}
  table.res td.v{text-align:right;font-weight:600}
  table.res tr.mayor td{background:#f0f7f6;color:var(--verde);font-weight:700}
  table.res tr.fin td{border-top:2px solid var(--verde);font-weight:700;font-size:15px}
  .letra{font-size:26px;color:var(--verde);font-weight:800;margin:2px 0 0}
  .sub{font-size:12px;color:var(--gris)}
  .tasas{margin-top:12px;font-size:11.5px;color:var(--gris)}
  .tasas span{display:inline-block;margin-right:12px}
  .badge{display:inline-block;background:#e8f3f1;color:var(--verde);border-radius:20px;padding:2px 10px;font-size:11px;margin-left:6px}
</style>
</head>
<body>
<header>
  <h1>Cotizador Fiflouu <span class="badge">motor TypeScript</span></h1>
  <p>Cálculo nativo (sin hoja de cálculo) · verificado al centavo contra el modelo original</p>
</header>
<div class="wrap">
  <div class="card">
    <h2>Datos de la cotización</h2>
    <div class="field">
      <label>Modo</label>
      <select id="modo">
        <option value="monto">Por monto</option>
        <option value="letra">Por letra quincenal</option>
        <option value="capacidad">Por capacidad máxima</option>
      </select>
    </div>
    <div class="field" id="f_monto"><label>Monto solicitado ($)</label><input id="monto" type="number" value="5000" step="100"></div>
    <div class="field hide" id="f_letra"><label>Letra quincenal ($)</label><input id="letra" type="number" value="150" step="1"></div>
    <div class="row2">
      <div class="field"><label>Plazo (cuotas)</label><input id="plazo" type="number" value="36"></div>
      <div class="field"><label>Tipo de cliente</label><select id="tipo"></select></div>
    </div>
    <div class="row2">
      <div class="field"><label>Promotor</label><select id="prom">
        <option value="1">Completo</option><option value="2">Media</option><option value="3">Baja</option>
        <option value="4">Sin Comisión</option><option value="5">Referido $100</option></select></div>
      <div class="field"><label>Clave de descuento</label><select id="clave">
        <option value="G8">Empresa Privada</option><option value="G9">Jubilado</option>
        <option value="G10">Gobierno</option><option value="G11">Pago Automático</option>
        <option value="G12">Descuento Voluntario</option></select></div>
    </div>
    <div class="chk"><input id="esCSS" type="checkbox"><label for="esCSS">Institución = Caja de Seguro Social (Pago Automático)</label></div>
    <div class="chk"><input id="af1" type="checkbox"><label for="af1">ITBMS fuera de interés y comisión</label></div>
    <div class="chk"><input id="af10" type="checkbox"><label for="af10">Interés compuesto (en vez de plano)</label></div>
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
      <h2 style="margin-top:14px">Datos del cliente (capacidad)</h2>
      <div class="row2">
        <div class="field"><label>Salario mensual ($)</label><input id="c_sal" type="number" value="1500"></div>
        <div class="field"><label>Descuentos comercial ($)</label><input id="c_desc" type="number" value="100"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Clave N-147 ($)</label><input id="c_n147" type="number" value="0"></div>
        <div class="field"><label>Embargos ($)</label><input id="c_emb" type="number" value="0"></div>
      </div>
      <div class="field"><label>Descontable mensual ($)</label><input id="c_descontable" type="number" value="1200"></div>
    </div>
  </div>

  <div class="card">
    <h2>Resultado</h2>
    <div class="sub">Letra quincenal</div>
    <div class="letra" id="r_letra">—</div>
    <div class="sub" id="r_cuotas"></div>
    <table class="res" id="r_tabla"></table>
    <div class="tasas" id="r_tasas"></div>
  </div>
</div>

<script type="module">
// ======================= MOTOR (TypeScript sin tipos) =======================
${engineJs}
// ======================= CONFIG DE LA FINANCIERA =======================
const CFG = ${JSON.stringify(cfg)};
const TIPO_NOMBRES = ${JSON.stringify(cfg.__tipoNombres || {1:'Diamante',2:'Platinum',3:'Premium',4:'24-59 meses',5:'0-23 meses',6:'Recien Nombrado',7:'Eventual'})};

// ======================= INTERFAZ =======================
const $ = id => document.getElementById(id);
const money = v => '$' + (Number(v)||0).toLocaleString('es-PA',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct = v => (Number(v)*100).toLocaleString('es-PA',{minimumFractionDigits:2,maximumFractionDigits:2}) + '%';

// poblar tipos de cliente
const selTipo = $('tipo');
for(let c=1;c<=7;c++){ const o=document.createElement('option'); o.value=c; o.textContent=c+' · '+TIPO_NOMBRES[c]; selTipo.appendChild(o); }
selTipo.value = 3;

function serial(dateStr){ const [y,m,d]=dateStr.split('-').map(Number); return Math.round((Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/86400000); }
function hoySerial(){ const d=new Date(); return Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(1899,11,30))/86400000); }

function toggles(){
  const modo=$('modo').value;
  $('f_monto').classList.toggle('hide', modo!=='monto');
  $('f_letra').classList.toggle('hide', modo!=='letra');
  $('f_cliente').classList.toggle('hide', modo!=='capacidad');
  $('f_jub').classList.toggle('hide', !$('jub').checked);
}

function calcular(){
  toggles();
  const modo=$('modo').value;
  const inp={
    plazo:+$('plazo').value, tipoCode:+$('tipo').value, promotorIdx:+$('prom').value,
    promotorNoTiene:false, clave:$('clave').value, esCSS:$('esCSS').checked,
    refi:+$('refi').value, terceros:+$('terceros').value,
    itbmsFuera:$('af1').checked, interesCompuesto:$('af10').checked,
    fnacSerial: serial($('fnac').value), genero:$('genero').value, todaySerial: hoySerial(),
  };
  if(!$('jub').checked){ inp.fnacSerial = hoySerial() - 25*365; } // sin tope: cliente joven

  let r;
  if(modo==='monto'){ inp.monto=+$('monto').value; r=cotizarPorMonto(inp,CFG); }
  else if(modo==='letra'){ inp.letra=+$('letra').value; r=cotizarPorLetra(inp,CFG); }
  else {
    const fin={ salario:+$('c_sal').value, descComercial:+$('c_desc').value, claveN147:+$('c_n147').value,
                embargos:+$('c_emb').value, descontable:+$('c_descontable').value };
    r=cotizarPorCapacidad(fin,inp,CFG);
  }

  $('r_letra').textContent = money(r.letraQuincenal);
  $('r_cuotas').textContent = r.cuotas + ' cuotas · ' + (r.cuotas*2) + ' quincenas';
  const rows = [
    ['mayor','Monto Total de Obligación', r.totalPagar],
    ['','Menos Intereses', r.interes],
    ['','Gastos Notariales', r.notaria],
    ['','FECI', r.feci],
    ['','ITBMS', r.itbms],
    ['','Servicio de Descuento', r.servicioDescuento],
    ['','Comisión Promotor', r.comisionPromotor],
    ['','Comisión Administrativa', r.comisionAdmin],
    ['','Timbres', r.timbres],
    ['mayor','Monto Obligación Neta', r.montoNeta],
    ['','Menos Refinanciamiento', inp.refi||0],
    ['','Cancelación a Terceros', inp.terceros||0],
    ['fin','Monto Recibido en Mano', r.sumaARecibir],
  ];
  $('r_tabla').innerHTML = rows.map(([cls,l,v])=>'<tr class="'+cls+'"><td>'+l+'</td><td class="v">'+money(v)+'</td></tr>').join('');
  $('r_tasas').innerHTML =
    '<span>Interés mensual: <b>'+pct(r.tasaInteresMensual)+'</b></span>'+
    '<span>Comisión admin: <b>'+pct(r.tasaComAdmin)+'</b></span>'+
    '<span>Comisión promotor: <b>'+pct(r.tasaComPromotor)+'</b></span>'+
    '<span>Servicio: <b>'+pct(r.tasaServicio)+'</b></span>';
}

document.querySelectorAll('input,select').forEach(el=>{ el.addEventListener('input',calcular); el.addEventListener('change',calcular); });
calcular();
</script>
</body>
</html>`;

writeFileSync(new URL('../Cotizador_Fiflouu__motor-TS.html', import.meta.url), html);
console.log('HTML generado: Cotizador_Fiflouu__motor-TS.html (' + html.length + ' bytes)');
