// Construye el v81 a partir del v76 (= v80 + meses de interés por cronograma real
// [en model.js] + servicio 3% para Débito y Voluntario): todo lo del v78 (motor por código, hoja
// eliminada) MÁS la corrección del corrimiento de matrices tarifarias introducido
// en el reordenamiento de tipos (v73) y los ajustes de parámetros del sistema web.
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
const OUT = '/home/user/flujo-n8n-claude-code/Cotizador_Fiflouu__web__v81.html';
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

writeFileSync(OUT, src);
console.log(`v81 generado. Tamaño: ${(src.length / 1024).toFixed(0)} KB`);
