// Construye el v78: el motor deja de ser la hoja de cálculo.
//  - Reemplaza la librería (HyperFormula/bessel/jStat) por model.js (motor por código).
//  - Elimina TODAS las fórmulas del workbook incrustado (la hoja desaparece como motor;
//    quedan solo datos de clientes y valores de configuración con dirección de celda).
//  - La pestaña «Calculadora» muestra solo el mapa (calcMapHTML); se elimina la rejilla
//    cruda de celdas de la hoja. DATOS conserva su rejilla (son datos).
import { readFileSync, writeFileSync } from 'node:fs';

const V76 = '/home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v76.html';
const OUT = '/home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v78.html';
let src = readFileSync(V76, 'utf8');
const modelJs = readFileSync(new URL('./model.js', import.meta.url), 'utf8');

let edits = 0;
function rep(old, neu, label) {
  const c = src.split(old).length - 1;
  if (c !== 1) { console.error(`[FAIL] ${label}: ${c} ocurrencias`); process.exit(1); }
  src = src.replace(old, neu); edits++;
}

// 1) Reemplazar el bloque de librerías por el motor por código
{
  const OPEN = '<script>', CLOSE = '</script>';
  const a = src.indexOf(OPEN);
  const b = src.indexOf(CLOSE) + CLOSE.length;
  const removed = src.slice(a, b);
  if (!removed.includes('bessel') || removed.includes('function refreshAll')) { console.error('[FAIL] límites del bloque de librerías'); process.exit(1); }
  src = src.slice(0, a) + OPEN + '\n' + modelJs + '\n' + CLOSE + src.slice(b);
  edits++;
}

// 2) Eliminar TODAS las fórmulas del workbook incrustado (RAW)
{
  const m = src.match(/const RAW = (\{.*?\});\n/s);
  if (!m) { console.error('[FAIL] RAW no encontrado'); process.exit(1); }
  const RAW = JSON.parse(m[1]);
  let dropped = 0;
  for (const sh of Object.keys(RAW.wb)) {
    const info = RAW.wb[sh];
    const before = info.cells.length;
    info.cells = info.cells.filter(t => !(typeof t[2] === 'string' && t[2][0] === '='));
    dropped += before - info.cells.length;
  }
  src = src.replace(m[0], 'const RAW = ' + JSON.stringify(RAW) + ';\n');
  console.log('fórmulas eliminadas del workbook:', dropped);
  edits++;
}

// 3) Pestaña «Calculadora»: solo el mapa del motor (sin rejilla de celdas)
rep(` const sh=activeSheet; const info=RAW.wb[sh];`,
    ` if(activeSheet==='Calculadora'){ const c=document.getElementById('gridWrap'); c.innerHTML=calcMapHTML(); return; }
 const sh=activeSheet; const info=RAW.wb[sh];`, 'early-return Calculadora');
rep(` if(sh==='Calculadora'){ h=calcMapHTML()+'<details class="cm-raw"><summary>▸ Ver / editar celdas crudas (avanzado)</summary>'+h+'</details>'; }
 else if(sh==='DATOS'){`,
    ` if(sh==='DATOS'){`, 'quitar details de Calculadora');

// 4) Textos
rep('ejecuta las fórmulas originales con HyperFormula',
    'el cálculo corre por código (ya no hay hoja de fórmulas)', 'subtítulo header');
rep('Vista de hoja de cálculo. Doble clic en una celda para editar su valor o fórmula (recalcula todo). Celdas con fórmula en verde; errores en rojo.',
    'Mapa del motor y datos. El cálculo corre por código (la hoja de fórmulas fue eliminada). En DATOS: doble clic en una celda cruda para editar su valor.', 'texto avanzado');
rep('Mapa de la hoja <b>Calculadora</b> (el motor), agrupado por función. Los valores son <b>en vivo</b> según la cédula y la selección actual. Es solo lectura: para editar una celda usa la pestaña «Calculadora».',
    'Mapa del <b>motor</b> (cálculo por código), agrupado por función. Los valores son <b>en vivo</b> según la cédula y la selección actual. Es solo lectura: los parámetros se editan en «⚙ Parámetros financiera».', 'lead calcMap');

writeFileSync(OUT, src);
console.log(`v78 generado (${edits} ediciones). Tamaño: ${(src.length / 1024).toFixed(0)} KB`);
