// Arnés de paridad: corre cada caso del oráculo por el motor TS y compara
// campo por campo contra los valores de la hoja (verdad de referencia).
import { readFileSync } from 'node:fs';
import { cotizarPorMonto, cotizarPorLetra, cotizarPorCapacidad } from './engine.ts';

const o = JSON.parse(readFileSync(new URL('./oracle.json', import.meta.url)));
const cfg = o.config;

// mapa: campo del motor -> celda del oráculo, y tolerancia
const MAP = [
  ['cuotas', 'G14', 0.0000001],
  ['sumaARecibir', 'F16', 0.005],
  ['itbms', 'F20', 0.005],
  ['interes', 'F23', 0.005],
  ['comisionAdmin', 'F25', 0.005],
  ['comisionPromotor', 'F26', 0.005],
  ['servicioDescuento', 'F27', 0.005],
  ['timbres', 'F28', 0.05],   // timbres redondea a 1 decimal
  ['notaria', 'F30', 0.005],
  ['feci', 'F31', 0.005],
  ['montoNeta', 'G21', 0.005],
  ['totalPagar', 'G33', 0.005],
  ['letraQuincenal', 'C24', 0.005],
  ['tasaInteresMensual', 'H23', 1e-9],
  ['tasaComAdmin', 'H25', 1e-9],
  ['tasaComPromotor', 'H26', 1e-9],
  ['tasaServicio', 'H27', 1e-9],
  ['H32', 'H32', 1e-9],
  ['H33', 'H33', 1e-6],
  ['AF11', 'AF11', 1e-9],
];

const stats = new Map(MAP.map(([f]) => [f, { maxDiff: 0, fails: 0, worst: null }]));
let casosOK = 0, casosFail = 0;
const porModo = { monto: { ok: 0, fail: 0 }, letra: { ok: 0, fail: 0 }, capacidad: { ok: 0, fail: 0 } };
const ejemplosFail = [];

for (const c of o.cases) {
  const mode = c.mode || 'monto';
  const r = mode === 'letra' ? cotizarPorLetra(c.in, cfg)
          : mode === 'capacidad' ? cotizarPorCapacidad(c.fin, c.in, cfg)
          : cotizarPorMonto(c.in, cfg);
  let caseOK = true;
  for (const [field, cell, tol] of MAP) {
    const got = r[field];
    const exp = c.out[cell];
    if (typeof exp !== 'number') continue; // saltar celdas en error (no las hay)
    const diff = Math.abs(got - exp);
    const s = stats.get(field);
    if (diff > s.maxDiff) { s.maxDiff = diff; s.worst = { in: c.in, got, exp }; }
    if (diff > tol) { s.fails++; caseOK = false; }
  }
  if (caseOK) { casosOK++; porModo[mode].ok++; }
  else { casosFail++; porModo[mode].fail++; if (ejemplosFail.length < 5) ejemplosFail.push({ mode, ...c.in }); }
}

console.log(`\nCasos: ${o.cases.length} | OK: ${casosOK} | con alguna diferencia: ${casosFail}`);
console.log(`  monto: OK ${porModo.monto.ok}/${porModo.monto.fail}  |  letra: OK ${porModo.letra.ok}/${porModo.letra.fail}  |  capacidad: OK ${porModo.capacidad.ok}/${porModo.capacidad.fail}\n`);
console.log('Campo                 maxDiff        fallos');
for (const [field] of MAP) {
  const s = stats.get(field);
  const flag = s.fails > 0 ? '  <== ' + s.fails : '';
  console.log(`  ${field.padEnd(20)} ${s.maxDiff.toExponential(3).padStart(12)} ${flag}`);
}
if (casosFail) {
  console.log('\nEjemplos de casos con diferencia:');
  ejemplosFail.forEach(x => console.log('  ', JSON.stringify(x)));
  // detalle del peor de un campo con fallos
  for (const [field] of MAP) {
    const s = stats.get(field);
    if (s.fails > 0) { console.log(`\nPeor caso en ${field}:`, JSON.stringify(s.worst)); break; }
  }
} else {
  console.log('\n✅ PARIDAD TOTAL: el motor TS coincide con la hoja en los ' + o.cases.length + ' casos, dentro de tolerancia (centavo).');
}
