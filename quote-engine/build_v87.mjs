// Construye el v87 a partir del v76: todo lo del v86 MÁS la conciliación del
// catálogo de claves (nombres canónicos y mismo orden en el selector de
// cotización, el panel financiera y las tablas de referencia; Pago Automático
// se subdivide en Contraloría y CSS en todas las tablas por clave) y un
// SELECTOR DE CLAVE en «5 · Matrices tarifarias» del panel para ver solo las
// matrices de la clave elegida (grupo base o variante) en lugar del listado
// largo. Corrige etiquetas desactualizadas: la variante ya no es solo
// «Descuento Voluntario» — también la usa Pago Automático (desde v85).
//
// Corrimiento: en v73 se reindexaron los tipos (1=Diamante..7=Eventual) pero las
// filas de las matrices quedaron en el orden viejo (1=Premium..6=Diamante,
// 7º=Platinum). Aquí se re-mapean las filas para que cada tipo conserve su tarifa
// ORIGINAL, y el tipo 7 (Eventual) recibe una fila auxiliar propia (r0+ext).
//
// Ajustes tomados del sistema web (referencia de negocio):
//   - Plazo máximo Platinum: 300 -> 132   (R22)
//   - Plazo máximo 24-59 meses: 72 -> 48  (R24)
//   - Meses máx clave Voluntario: 288 -> 144 (AK7)
import { readFileSync, writeFileSync } from 'node:fs';

const V76 = '/home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html';
const OUT = '/home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v87.html';
let src = readFileSync(V76, 'utf8');
const modelJs = readFileSync(new URL('./model.js', import.meta.url), 'utf8');

function rep(old, neu, label) {
  const c = src.split(old).length - 1;
  if (c !== 1) { console.error(`[FAIL] ${label}: ${c} ocurrencias`); process.exit(1); }
  src = src.replace(old, neu);
}

// 1) Librerías -> motor por código
{
  const OPEN = '<script>', CLOSE = '</script>';
  const a = src.indexOf(OPEN), b = src.indexOf(CLOSE) + CLOSE.length;
  const removed = src.slice(a, b);
  if (!removed.includes('bessel') || removed.includes('function refreshAll')) { console.error('[FAIL] bloque librerías'); process.exit(1); }
  src = src.slice(0, a) + OPEN + '\n' + modelJs + '\n' + CLOSE + src.slice(b);
}

// 2) RAW: quitar fórmulas + RE-MAPEAR MATRICES + ajustes del web
{
  const m = src.match(/const RAW = (\{.*?\});\n/s);
  if (!m) { console.error('[FAIL] RAW'); process.exit(1); }
  const RAW = JSON.parse(m[1]);

  // ---- helpers sobre RAW.wb.Calculadora (cells = [row, col, val], 1-indexados) ----
  const CALC = RAW.wb.Calculadora.cells;
  const colNum = (s) => { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
  const getCell = (col, row) => { const c = colNum(col); const t = CALC.find(t => t[0] === row && t[1] === c); return t ? t[2] : null; };
  const setCell = (col, row, val) => {
    const c = colNum(col); const t = CALC.find(t => t[0] === row && t[1] === c);
    if (val === null) { if (t) CALC.splice(CALC.indexOf(t), 1); return; }
    if (t) t[2] = val; else CALC.push([row, c, val]);
  };
  const COLS = ['L', 'M', 'N', 'O', 'P'];
  const getRow = (r) => COLS.map(c => getCell(c, r));
  const setRow = (r, vals) => COLS.forEach((c, i) => setCell(c, r, vals[i]));

  // Materializar las dos celdas calculadas de las matrices (N39/N88 = N37/L37*L39|L88)
  const n37 = getCell('N', 37), l37 = getCell('L', 37);
  for (const rr of [39, 88]) {
    const v = getCell('N', rr);
    if (typeof v === 'string' && v.startsWith('=')) setCell('N', rr, n37 / l37 * getCell('L', rr));
  }

  // Re-mapeo: viejo índice -> tipo: 1=Premium 2=24-59 3=0-23 4=RN 5=Eventual 6=Diamante, 7º=Platinum
  //           nuevo índice -> tipo: 1=Diamante 2=Platinum 3=Premium 4=24-59 5=0-23 6=RN, 7º=Eventual
  // MATS: [r0, séptimoViejo ('last' = fila Diamante | número literal), filaExt para Eventual]
  const MATS = [
    [37, 'last', 43],   // Multiplicador (S37)
    [45, 'last', 52],   // Comisión (S45)
    [53, 0.02, null],   // Interés (S53)
    [61, 0.25, null],   // Gasto de cierre (S61)
    [86, 'last', 92],   // Costo (S86)
    [94, 'last', 100],  // Comisión Voluntario (S94)
    [102, 0.02, null],  // Interés Voluntario (S102)
    [110, 0.25, null],  // Gasto Voluntario (S110)
  ];
  for (const [r0, seventh, ext] of MATS) {
    const old = []; for (let i = 0; i < 6; i++) old.push(getRow(r0 + i));
    const oldPlatinum = seventh === 'last' ? old[5] : [seventh, seventh, seventh, seventh, seventh];
    const oldEventual = old[4];
    setRow(r0 + 0, old[5]);        // Diamante
    setRow(r0 + 1, oldPlatinum);   // Platinum
    setRow(r0 + 2, old[0]);        // Premium
    setRow(r0 + 3, old[1]);        // 24-59 meses
    setRow(r0 + 4, old[2]);        // 0-23 meses
    setRow(r0 + 5, old[3]);        // Recien Nombrado
    if (ext) {                     // Eventual (fila auxiliar, la usa el tipo 7)
      const busy = COLS.some(c => getCell(c, ext) !== null);
      if (busy) { console.error(`[FAIL] fila ext ${ext} ocupada`); process.exit(1); }
      setRow(ext, oldEventual);
    } else {
      // séptimo literal: debe coincidir con la fila Eventual vieja (verificación)
      if (!oldEventual.every(v => v === seventh)) { console.error(`[FAIL] Eventual de r0=${r0} no coincide con literal ${seventh}`); process.exit(1); }
    }
  }
  console.log('matrices re-mapeadas al orden nuevo de tipos (8 matrices)');

  // Ajustes del sistema web
  setCell('R', 22, 132);   // Plazo máx Platinum
  setCell('R', 24, 48);    // Plazo máx 24-59 meses
  setCell('AK', 7, 144);   // Meses máx clave Voluntario
  setCell('AK', 3, 48);    // Meses máx CSS: 48 (decisión de negocio; la app ya forzaba 48)
  // Servicio de descuento por producto = 3% (alineado al sistema web, verificado
  // con cotizaciones reales): Pago Auto Contraloría (AF3), Pago Auto CSS (AF4)
  // y Descuento Voluntario (AF8). Empresa Privada (AF6) y Gobierno (AF5) ya eran 3%.
  setCell('AF', 3, 0.03); setCell('AF', 4, 0.03); setCell('AF', 8, 0.03);
  console.log('ajustes: R22=132, R24=48, AK7=144, AK3=48, AF3/AF4/AF8=3%');

  // ================= MATRICES LITERALES DEL PORTAL (extracción 03/07/2026) ======
  // Orden de tipos (filas r0..r0+5 = 1..6, ext = Eventual): Diamante, Platinum,
  // Premium, 24-59, 0-23, Recien Nombrado | Eventual. Columnas L..P = Completo,
  // Media, Baja, Sin Comision, Referido.
  const putMat = (r0, ext, rows) => { // rows: 7 filas [Diam, Plat, Prem, 24-59, 0-23, RN, Eventual]
    for (let i = 0; i < 6; i++) setRow(r0 + i, rows[i]);
    if (ext) setRow(ext, rows[6]);
  };
  const pct = (rows) => rows.map(r => r.map(v => v / 100));
  // --- Descuento Directo (matrices base) ---
  putMat(45, 52, pct([[5,3.6,2,0,0],[5,3.6,2,0,0],[5,3.6,2,0,0],[3.6,3.6,2,0,0],[3.6,3.6,2,0,0],[3.6,3.6,2,0,0],[3.6,3,2,0,0]]));            // comision (promotor)
  putMat(53, null, pct([[1,1,1,1,1],[2,2,2,2,2],[2,2,2,2,2],[2,2,2,2,2],[2,2,2,2,2],[2,2,2,2,2],[2,2,2,2,2]]));                              // interes (7º literal 0.02 ✓)
  putMat(61, null, pct([[35,35,35,35,35],[25,25,25,25,25],[25,25,25,25,25],[25,25,25,25,25],[25,25,25,25,25],[25,25,25,25,25],[25,25,25,25,25]])); // gasto_cierre (7º 0.25 ✓)
  const costo=[[1,.9,.8,.7,1],[1,.9,.8,.7,1],[1,.9,.8,.7,1],[1.5,1.4,1.3,1.2,1.5],[2,1.9,1.6,1.5,2],[1,.9,.8,.7,1],[1,.9,.8,.7,1]];
  putMat(37, 43, costo); putMat(86, 92, costo);                                                                                                // costo (igual en los 3 productos)
  // --- Débito Automático y Pago Voluntario (idénticas en el portal; matrices variante) ---
  putMat(94, 100, pct([[7,3.6,2,0,0],[7,3.6,2,0,0],[7,3.6,2,0,0],[3.6,3.6,2,0,0],[3.6,3.6,2,0,0],[3.6,3.6,2,0,0],[3.6,3,2,0,0]]));           // comision
  putMat(102, null, pct([[2,2,2,2,2],[2,2,2,2,2],[2,2,2,2,2],[2,2,2,2,2],[2,2,2,2,2],[2,2,2,2,2],[2,2,2,2,2]]));                             // interes
  putMat(110, null, pct([[25,25,25,25,25],[25,25,25,25,25],[25,25,25,25,25],[25,25,25,25,25],[25,25,25,25,25],[25,25,25,25,25],[25,25,25,25,25]])); // gasto_cierre
  // ============ MESES DE COMISIÓN AL PROMOTOR (AI10:AO15, clave × tipo) ==========
  // Derivado de las cotizaciones vigentes: 144 en general; producto Voluntario = 60
  // (fila 15); Empresa Privada × Platinum = 60 (col AJ, fila 13).
  const AMCOLS = ['AI','AJ','AK','AL','AM','AN','AO'];
  for (let r = 10; r <= 15; r++) for (const c of AMCOLS) setCell(c, r, 144);
  for (const c of AMCOLS) setCell(c, 15, 60);   // fila Voluntario
  setCell('AJ', 13, 60);                        // Empresa Privada × Platinum
  // Servicio Jubilado = 3% (portal cobra 3% en todos los productos)
  setCell('AF', 7, 0.03);
  console.log('matrices del portal aplicadas (DD + Débito/Voluntario) · AM comisión · AF7=3%');

  // Switch por clave: base de la comisión al promotor (AL2:AL7)
  // 0 = % sobre el total a pagar (método original) · 1 = % sobre el monto a financiar
  for (let r = 2; r <= 7; r++) setCell('AL', r, 0);
  console.log('switch base comisión (AL2:AL7) inicializado en 0 (método original)');

  // Quitar todas las fórmulas (la hoja deja de existir como motor)
  let dropped = 0;
  for (const sh of Object.keys(RAW.wb)) {
    const info = RAW.wb[sh]; const before = info.cells.length;
    info.cells = info.cells.filter(t => !(typeof t[2] === 'string' && t[2][0] === '='));
    dropped += before - info.cells.length;
  }
  console.log('fórmulas eliminadas:', dropped);

  src = src.replace(m[0], 'const RAW = ' + JSON.stringify(RAW) + ';\n');
}

// 3) UI: pestaña Calculadora = solo mapa; textos (idéntico al v78)
rep(` const sh=activeSheet; const info=RAW.wb[sh];`,
    ` if(activeSheet==='Calculadora'){ const c=document.getElementById('gridWrap'); c.innerHTML=calcMapHTML(); return; }
 const sh=activeSheet; const info=RAW.wb[sh];`, 'early-return Calculadora');
rep(` if(sh==='Calculadora'){ h=calcMapHTML()+'<details class="cm-raw"><summary>▸ Ver / editar celdas crudas (avanzado)</summary>'+h+'</details>'; }
 else if(sh==='DATOS'){`,
    ` if(sh==='DATOS'){`, 'quitar details Calculadora');
rep('ejecuta las fórmulas originales con HyperFormula',
    'el cálculo corre por código (ya no hay hoja de fórmulas)', 'subtítulo');
rep('Vista de hoja de cálculo. Doble clic en una celda para editar su valor o fórmula (recalcula todo). Celdas con fórmula en verde; errores en rojo.',
    'Mapa del motor y datos. El cálculo corre por código (la hoja de fórmulas fue eliminada). En DATOS: doble clic en una celda cruda para editar su valor.', 'texto avanzado');
rep('Mapa de la hoja <b>Calculadora</b> (el motor), agrupado por función. Los valores son <b>en vivo</b> según la cédula y la selección actual. Es solo lectura: para editar una celda usa la pestaña «Calculadora».',
    'Mapa del <b>motor</b> (cálculo por código), agrupado por función. Los valores son <b>en vivo</b> según la cédula y la selección actual. Es solo lectura: los parámetros se editan en «⚙ Parámetros financiera».', 'lead calcMap');

// Débito / Pago Automático: respetar el plazo SOLICITADO topado por la cuenta
// (como el portal), en vez de forzar siempre el máximo (72/48).
rep('const targetPlazo=pagoAuto?(esCSS?48:72):plazoReq;',
    'const targetPlazo=pagoAuto?Math.min(plazoReq,(esCSS?48:72)):plazoReq;', 'plazo pago automático');

// ===== v86: sección 5c del panel financiera separada por clave (switch de base + meses) =====
rep(`H+='<h3>5c · Meses de comisión al promotor<span class="src">Calculadora!AI:AO 10:15 · fila = clave · columna = tipo</span></h3>';
 H+='<p class="fp-lead" style="margin:-2px 0 10px">Techo de meses sobre los que se paga comisión al promotor; varía por <b>clave</b> y <b>tipo de cliente</b>. Pasado ese techo, la comisión se prorratea. (Hoy en 144 = igual que antes.)</p>';
 const _tn=[];for(let i=1;i<=7;i++){_tn.push(tipoNombre(i));}
 H+='<table class="fp-mat"><tr><th>Clave</th>'+_tn.map(n=>'<th>'+n+'</th>').join('')+'</tr>';
 for(let r=10;r<=15;r++){
   const _cl=getV(C,'AH'+r); if(!claveHabByName(_cl)) continue;
   H+='<tr><td class="k">'+(_cl||('Fila '+r))+'</td>';
   for(let c=35;c<=41;c++){const cl=colLetter(c-1);H+='<td><input class="fp-inp" type="number" step="1" min="0" data-cell="'+cl+r+'" data-scale="1" value="'+Math.round(gN(cl+r))+'"></td>';}
   H+='</tr>';
 }
 H+='</table>';`,
`H+='<h3>5c · Comisión al promotor por clave<span class="src">base: Calculadora!AL2:AL7 · meses: AI10:AO15</span></h3>';
 H+='<p class="fp-lead" style="margin:-2px 0 10px">Un cuadro por <b>clave</b>: la <b>base de cálculo</b> de la comisión (switch) y el <b>techo de meses</b> por tipo de cliente. Pasado el techo, la comisión se prorratea — <b>aplica con ambas bases</b>.</p>';
 const _tn=[];for(let i=1;i<=7;i++){_tn.push(tipoNombre(i));}
 for(const _cc of CLA_CANON){ const r=_cc[4];
   const _cl=getV(C,'AH'+r); if(!claveHabByName(_cl)) continue;
   const _al='AL'+(r-8); const _alv=Math.round(gN(_al));
   H+='<div style="border:1px solid #cfd9e0;border-radius:8px;padding:8px 10px;margin:0 0 10px;background:#fbfdfe">';
   H+='<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:7px"><b style="min-width:220px">'+_cc[1]+'</b>';
   H+='<label style="font-size:12.5px;color:#345">Base de la comisión:&nbsp;<select class="fp-inp" data-cell="'+_al+'" data-scale="1" style="padding:3px 6px;min-width:290px">';
   H+='<option value="0"'+(_alv===1?'':' selected')+'>Total a pagar (gross-up, actual)</option>';
   H+='<option value="1"'+(_alv===1?' selected':'')+'>Monto a financiar (base de los intereses)</option>';
   H+='</select></label></div>';
   H+='<table class="fp-mat"><tr><th>Meses máx</th>'+_tn.map(n=>'<th>'+n+'</th>').join('')+'</tr><tr><td class="k">por tipo</td>';
   for(let c=35;c<=41;c++){const cl=colLetter(c-1);H+='<td><input class="fp-inp" type="number" step="1" min="0" data-cell="'+cl+r+'" data-scale="1" value="'+Math.round(gN(cl+r))+'"></td>';}
   H+='</tr></table></div>';
 }`, 'panel 5c por clave');

// ===== v86: Tablas ref — base de comisión por clave, con resaltado amarillo =====
rep(`H+=sec('Meses de comisión al promotor','Calculadora!AI10:AO15 · editable en ⚙ Parámetros financiera','Fila = clave · columna = tipo de cliente. La celda activa (clave × tipo) se resalta; pasado ese techo la comisión se prorratea.','');
 const _tn=[];for(let i=1;i<=7;i++){_tn.push(tipoNombre(i));}
 let sp='<table class="ref"><tr><th>Clave</th>'+_tn.map((n,i)=>'<th'+((i+1)===J2act?' class="xcolh"':'')+'>'+n+'</th>').join('')+'</tr>';
 for(let r=10;r<=15;r++){ const _cl=gv('AH'+r); if(!claveHabByName(_cl)) continue; const actR=((r-9)===cIdx);
   sp+='<tr'+(actR?' class="xrow"':'')+'><td class="k">'+(_cl||'')+'</td>';
   for(let i=1;i<=7;i++){ const col=colLetter(33+i); const actC=(i===J2act); const cls=(actR&&actC)?'xhit':(actC?'xcol':''); sp+='<td'+(cls?' class="'+cls+'"':'')+'>'+num(gv(col+r))+'</td>'; }
   sp+='</tr>';
 }
 H+=sp+'</table>';`,
`H+=sec('Comisión al promotor por clave','base: Calculadora!AL2:AL7 · meses: AI10:AO15 · editable en ⚙ Parámetros financiera','Por clave: la base de cálculo de la comisión y el techo de meses por tipo. La fila de la clave activa se marca en amarillo (base y celda del tipo activo); pasado el techo la comisión se prorratea — aplica con ambas bases.','');
 const _tn=[];for(let i=1;i<=7;i++){_tn.push(tipoNombre(i));}
 let sp='<table class="ref"><tr><th>Clave</th><th>Base de la comisión</th>'+_tn.map((n,i)=>'<th'+((i+1)===J2act?' class="xcolh"':'')+'>'+n+'</th>').join('')+'</tr>';
 for(const _cc of CLA_REF){ const r=_cc[1]+8; const _cl=gv('AH'+r); if(!claveHabByName(_cl)) continue; const actR=((r-9)===cIdx);
   const _bN=Number(gv('AL'+(r-8)))===1;
   sp+='<tr'+(actR?' class="xrow"':'')+'><td class="k">'+_cc[0]+'</td>';
   sp+='<td'+(actR?' class="xhit"':'')+'>'+(_bN?'Monto a financiar':'Total a pagar')+'</td>';
   for(let i=1;i<=7;i++){ const col=colLetter(33+i); const actC=(i===J2act); const cls=(actR&&actC)?'xhit':(actC?'xcol':''); sp+='<td'+(cls?' class="'+cls+'"':'')+'>'+num(gv(col+r))+'</td>'; }
   sp+='</tr>';
 }
 H+=sp+'</table>';`, 'tabla ref base comisión');

// ===== v87: catálogo canónico de claves + selector en «5 · Matrices tarifarias» =====
// CLA_CANON: [id, nombre canónico, grupo, filaUmbral (AH2:AK7), filaMeses (AH10:AO15)]
rep(`H+='<h3>5 · Matrices tarifarias<span class="src">fila = Tipo de Cliente · columna = Promotor · valores en %</span></h3>';
 H+='<p class="fp-lead" style="margin:-2px 0 10px">La fila del tipo de cliente activo se resalta. La tasa final cruza fila (tipo) × columna (promotor).</p>';
 H+=matrix('Comisión','Calculadora!L45:P50',45,50);
 H+=matrix('Interés','Calculadora!L53:P58',53,58);
 H+=matrix('Gasto de cierre = Comisión Administrativa','Calculadora!L61:P66',61,66);
 if(claveHabilitada('G12')){
 H+=matrix('Comisión — variante Descuento Voluntario','Calculadora!L94:P99',94,99);
 H+=matrix('Interés — variante Descuento Voluntario','Calculadora!L102:P107',102,107);
 H+=matrix('Gasto de cierre — variante Descuento Voluntario','Calculadora!L110:P115',110,115);
 }`,
`const CLA_CANON=[['G8','Empresa Privada','base',5,13],['G9','Jubilado y Pensionado','base',6,14],['G10','Gobierno (Descuento Directo)','base',4,12],['G11C','Pago Automático — Contraloría','variante',2,10],['G11S','Pago Automático — CSS','variante',3,11],['G12','Descuento Voluntario','variante',7,15]];
 const _claHab=(id)=>claveHabilitada(id.slice(0,3)==='G11'?'G11':id);
 H+='<h3>5 · Matrices tarifarias — por clave<span class="src">fila = Tipo de Cliente · columna = Promotor · valores en %</span></h3>';
 H+='<p class="fp-lead" style="margin:-2px 0 8px">Elige la <b>clave</b> para ver sus matrices. La fila del tipo de cliente activo se resalta; la tasa final cruza fila (tipo) × columna (promotor).</p>';
 const _claAct=gN('G8')>0?'G8':gN('G9')>0?'G9':gN('G10')>0?'G10':gN('G11')>0?((String(getV(C,'B11')||'').indexOf('Seguro')>=0)?'G11S':'G11C'):'G12';
 let _mcSel=window._matCla||_claAct; if(!_claHab(_mcSel.slice(0,3)==='G11'?'G11':_mcSel)) _mcSel=_claAct;
 const _mcDef=CLA_CANON.find(x=>x[0]===_mcSel)||CLA_CANON[0];
 H+='<div style="margin:0 0 10px"><label style="font-size:12.5px;color:#345"><b>Clave:</b>&nbsp;<select style="padding:3px 6px;min-width:260px" onchange="window._matCla=this.value;refreshAll()">';
 for(const _cc of CLA_CANON){ if(!_claHab(_cc[0])) continue; H+='<option value="'+_cc[0]+'"'+(_cc[0]===_mcSel?' selected':'')+'>'+_cc[1]+'</option>'; }
 H+='</select></label>';
 const _grpCla=CLA_CANON.filter(x=>x[2]===_mcDef[2]&&_claHab(x[0])).map(x=>x[1]).join(' · ');
 H+='<div style="font-size:11.5px;color:#678;margin-top:4px">Grupo <b>'+_mcDef[2]+'</b> — estas matrices las comparten: <b>'+_grpCla+'</b>. Editarlas afecta a todas las claves del grupo.</div></div>';
 if(_mcDef[2]==='base'){
 H+=matrix('Comisión — '+_mcDef[1],'Calculadora!L45:P50',45,50);
 H+=matrix('Interés — '+_mcDef[1],'Calculadora!L53:P58',53,58);
 H+=matrix('Gasto de cierre = Comisión Administrativa — '+_mcDef[1],'Calculadora!L61:P66',61,66);
 } else {
 H+=matrix('Comisión — '+_mcDef[1],'Calculadora!L94:P99',94,99);
 H+=matrix('Interés — '+_mcDef[1],'Calculadora!L102:P107',102,107);
 H+=matrix('Gasto de cierre = Comisión Administrativa — '+_mcDef[1],'Calculadora!L110:P115',110,115);
 }`, 'panel 5: selector de clave');

// Panel 5b: mismas claves canónicas y mismo orden
rep(` for(let r=2;r<=7;r++){
   const _cl=getV(C,'AH'+r); if(!claveHabByName(_cl)) continue;
   H+='<tr><td class="k">'+(_cl||('Fila '+r))+'</td>'+
      '<td><input class="fp-inp" type="number" step="0.1" min="0" data-cell="AI'+r+'" data-scale="100" value="'+(+(gN('AI'+r)*100).toFixed(2))+'"><span class="fp-pct">%</span></td>'+`,
` for(const _cc of CLA_CANON){ const r=_cc[3];
   const _cl=getV(C,'AH'+r); if(!claveHabByName(_cl)) continue;
   H+='<tr><td class="k">'+_cc[1]+'</td>'+
      '<td><input class="fp-inp" type="number" step="0.1" min="0" data-cell="AI'+r+'" data-scale="100" value="'+(+(gN('AI'+r)*100).toFixed(2))+'"><span class="fp-pct">%</span></td>'+`, 'panel 5b canónico');

// Tablas ref — Umbral: declara CLA_REF ([nombre, filaUmbral]) y usa orden canónico
rep(` let su='<table class="ref"><tr><th>Clave</th><th>Porcentaje</th><th>Meses</th><th>Meses Máx</th></tr>';
 for(let r=2;r<=7;r++){ const _cl=gv('AH'+r); if(!claveHabByName(_cl)) continue; const act=((r-1)===cIdx); su+='<tr'+(act?' class="xrow"':'')+'><td class="k">'+(_cl||'')+'</td><td>'+pc(gv('AI'+r))+'</td><td>'+num(gv('AJ'+r))+'</td><td>'+num(gv('AK'+r))+'</td></tr>'; }`,
` const CLA_REF=[['Empresa Privada',5],['Jubilado y Pensionado',6],['Gobierno (Descuento Directo)',4],['Pago Automático — Contraloría',2],['Pago Automático — CSS',3],['Descuento Voluntario',7]];
 let su='<table class="ref"><tr><th>Clave</th><th>Porcentaje</th><th>Meses</th><th>Meses Máx</th></tr>';
 for(const _cc of CLA_REF){ const r=_cc[1]; const _cl=gv('AH'+r); if(!claveHabByName(_cl)) continue; const act=((r-1)===cIdx); su+='<tr'+(act?' class="xrow"':'')+'><td class="k">'+_cc[0]+'</td><td>'+pc(gv('AI'+r))+'</td><td>'+num(gv('AJ'+r))+'</td><td>'+num(gv('AK'+r))+'</td></tr>'; }`, 'tablas ref umbral canónico');

// Tablas ref — Servicio: claves canónicas (4º elemento = nombre crudo para habilitación)
rep(`const sdRows=[['Contraloría','AF3',1],['CSS','AF4',2],['Gobierno','AF5',3],['Empresa Privada','AF6',4],['Jubilado','AF7',5],['Voluntario','AF8',6]];
 let sd='<table class="ref"><tr><th>Clave</th><th>Servicio de descuento</th></tr>';
 for(const sr of sdRows){ if(!claveHabByName(sr[0])) continue; const act=(sr[2]===cIdx); sd+='<tr'+(act?' class="xrow"':'')+'><td class="k">'+sr[0]+'</td><td>'+pc(gv(sr[1]))+'</td></tr>'; }`,
`const sdRows=[['Empresa Privada','AF6',4,'Empresa Privada'],['Jubilado y Pensionado','AF7',5,'Jubilado'],['Gobierno (Descuento Directo)','AF5',3,'Gobierno'],['Pago Automático — Contraloría','AF3',1,'Contraloría'],['Pago Automático — CSS','AF4',2,'CSS'],['Descuento Voluntario','AF8',6,'Voluntario']];
 let sd='<table class="ref"><tr><th>Clave</th><th>Servicio de descuento</th></tr>';
 for(const sr of sdRows){ if(!claveHabByName(sr[3])) continue; const act=(sr[2]===cIdx); sd+='<tr'+(act?' class="xrow"':'')+'><td class="k">'+sr[0]+'</td><td>'+pc(gv(sr[1]))+'</td></tr>'; }`, 'tablas ref servicio canónico');

// Tablas ref — matrices §4: la variante es de Pago Automático Y Voluntario (desde v85)
rep(`H+='<p class="desc" style="margin-top:10px">Variante <b>Descuento Voluntario</b> (cuando <code>G12&gt;0</code>): se usan estas matrices en vez de las de arriba.</p>';
 if(claveHabilitada('G12')){`,
`H+='<p class="desc" style="margin-top:10px">Variante <b>Pago Automático y Descuento Voluntario</b> (cuando <code>G11&gt;0</code> o <code>G12&gt;0</code>): se usan estas matrices en vez de las de arriba. Las matrices de arriba (base) aplican a Empresa Privada, Jubilado y Gobierno.</p>';
 if(claveHabilitada('G12')||claveHabilitada('G11')){`, 'tablas ref gate variante');
rep('Comisión — variante Descuento Voluntario<span class="src">K94:P99 · S94</span>',
    'Comisión — variante (Pago Automático y Voluntario)<span class="src">K94:P99 · S94</span>', 'título variante comisión');
rep('Interés — variante Descuento Voluntario<span class="src">K102:P107 · S102</span>',
    'Interés — variante (Pago Automático y Voluntario)<span class="src">K102:P107 · S102</span>', 'título variante interés');
rep('Gasto de cierre — variante Descuento Voluntario<span class="src">K110:P115 · S110</span>',
    'Gasto de cierre — variante (Pago Automático y Voluntario)<span class="src">K110:P115 · S110</span>', 'título variante gasto');
rep('salvo <code>G12&gt;0</code> que usa las matrices «variante»',
    'salvo <code>G11&gt;0</code> o <code>G12&gt;0</code>, que usan las matrices «variante»', 'nota programador variante');

writeFileSync(OUT, src);
console.log(`v87 generado. Tamaño: ${(src.length / 1024).toFixed(0)} KB`);
