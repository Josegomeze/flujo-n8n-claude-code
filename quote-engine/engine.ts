// Motor de cotización en TypeScript — reimplementación del cálculo de la hoja
// (camino por MONTO). Sustituye a las fórmulas de HyperFormula por código tipado
// y probado. Ver README.md para el alcance cubierto por esta prueba de concepto.

// ---------- Redondeo estilo Excel / HyperFormula ----------
// Excel/HyperFormula redondean "mitad hacia afuera" (away from zero) sobre el mismo
// double IEEE-754 que ve el motor. Operamos sobre |x|·10^d directamente (sin epsilon):
// coincide con HyperFormula en los bordes probados (1272.265 -> 1272.27; 25.9249999… -> 25.92).
export function xround(x: number, d: number): number {   // mitad hacia afuera
  if (!isFinite(x)) return x;
  const f = Math.pow(10, d);
  return Math.sign(x) * Math.floor(Math.abs(x) * f + 0.5) / f;
}
export function xrounddown(x: number, d: number): number { // hacia cero
  const f = Math.pow(10, d);
  return Math.sign(x) * Math.floor(Math.abs(x) * f) / f;
}
export function xroundup(x: number, d: number): number {   // alejándose de cero
  const f = Math.pow(10, d);
  return Math.sign(x) * Math.ceil(Math.abs(x) * f) / f;
}
export function xtrunc(x: number, d: number): number {     // hacia cero
  const f = Math.pow(10, d);
  return Math.sign(x) * Math.floor(Math.abs(x) * f) / f;
}

// ---------- Tipos ----------
export type ClaveKey = 'G8' | 'G9' | 'G10' | 'G11' | 'G12';

export interface FinancieraConfig {
  matrizComision: number[][];     // 6 filas (tipo 1..6; tipo 7 reutiliza fila 6) × 5 cols (promotor 1..5)
  matrizInteres: number[][];      // idem
  matrizGastoCierre: number[][];  // idem (comisión administrativa)
  itbmsRate: number;              // Y23 (0.07)
  timbresRate: number;            // Y25 (0.001)
  feciRate: number;               // Y26 (0.01)
  notaria: number;                // F30 (25)
  amCap: number;                  // AM8 (tope de meses de comisión, 144)
  servicioRate: {                 // Y20 por clave (AF3..AF8)
    G8: number; G9: number; G10: number; G11_CSS: number; G11: number; G12: number;
  };
  tipoMaxPlazo: number[];         // R21..R27 por código (índice 0 = tipo 1)
}

export interface QuoteInput {
  monto?: number;           // D2 (camino por monto)
  letra?: number;           // D8 (camino por letra)
  plazo: number;            // F14 solicitado
  tipoCode: number;         // 1..7
  promotorIdx: number;      // 1..5 (Completo..Referido)
  promotorNoTiene: boolean; // Motor!B6 === 'No tiene' -> comisión promotor = 0
  clave: ClaveKey;          // clave de descuento activa
  esCSS: boolean;           // institución = Caja de Seguro Social (afecta G11)
  refi?: number;            // F17
  terceros?: number;        // F18
  tercerosM?: number;       // F19
}

export interface QuoteOutput {
  cuotas: number;           // G14
  sumaARecibir: number;     // F16
  itbms: number;            // F20
  interes: number;          // F23
  comisionAdmin: number;    // F25
  comisionPromotor: number; // F26
  servicioDescuento: number;// F27
  timbres: number;          // F28
  notaria: number;          // F30
  feci: number;             // F31
  montoNeta: number;        // G21
  totalPagar: number;       // G33
  letraQuincenal: number;   // C24
  // tasas resueltas (para diagnóstico / paridad)
  tasaInteresMensual: number; // H23 = Y16
  tasaComAdmin: number;       // H25
  tasaComPromotor: number;    // H26
  tasaServicio: number;       // H27
  H32: number;
  H33: number;
  AF11: number;
}

// CHOOSE(J2, fila1..fila6, fallback7): los tipos 1..6 toman su fila; el tipo 7 usa el
// 7º argumento del CHOOSE, que en la hoja es un literal (interés/gasto cierre) o la
// fila 6 (comisión). fallback7 = número literal o 'row6'.
function chooseTipo(mat: number[][], tipoCode: number, promCol: number, fallback7: number | 'row6'): number {
  if (tipoCode <= 6) return mat[tipoCode - 1][promCol];
  return fallback7 === 'row6' ? mat[5][promCol] : fallback7;
}

// Tasas y cuotas resueltas (comunes a ambos caminos, monto y letra).
interface Tasas {
  cuotas: number;   // G14
  Y16: number;      // interés mensual (H23)
  H25: number;      // comisión administrativa
  H26: number;      // comisión promotor (Y19)
  H27: number;      // servicio (Y20)
  H28: number;      // timbres (Y25)
  H31: number;      // FECI (Y26)
  H20: number;      // ITBMS (Y23)
  H32: number;      // H26+H27+H28
  H14: number;      // cuotas·13/12
  AF11: number;     // factor de interés plano
  AB19: number;     // "Referido $100"
}

// montoParaG15: valor de D2 que ve G15 (= monto en camino por monto; 0 en camino por letra).
function resolverTasas(inp: QuoteInput, cfg: FinancieraConfig, montoParaG15: number): Tasas {
  const promCol = inp.promotorIdx - 1;
  const tipoMax = cfg.tipoMaxPlazo[inp.tipoCode - 1];
  // G15/G14 (sin jubilación; con Pago Automático el plazo se fuerza a 60 CSS / 72 Contraloría)
  const G15 = inp.clave === 'G11' ? (inp.esCSS ? 60 : 72) : (montoParaG15 > 4000 ? 300 : tipoMax);
  const cuotas = Math.min(inp.plazo, G15);

  const Y16 = chooseTipo(cfg.matrizInteres, inp.tipoCode, promCol, 0.02);
  const H25 = chooseTipo(cfg.matrizGastoCierre, inp.tipoCode, promCol, 0.25);
  const S45 = chooseTipo(cfg.matrizComision, inp.tipoCode, promCol, 'row6');
  const H26 = (inp.promotorNoTiene ? 0 : S45) * (Math.min(cuotas, cfg.amCap) / cuotas);
  const H27 = servicioRate(inp, cfg);
  const H28 = cfg.timbresRate;
  const H31 = cfg.feciRate;
  const H20 = cfg.itbmsRate;
  const H14 = cuotas / 12 + cuotas;
  return {
    cuotas, Y16, H25, H26, H27, H28, H31, H20,
    H32: H26 + H27 + H28, H14, AF11: Y16 * H14,
    AB19: inp.promotorIdx === 5 ? 100 : 0,
  };
}

// Renglones desde la obligación P7 (idéntico en ambos caminos; AF1 = 0, ITBMS dentro).
function lineasDesdeP7(P7: number, t: Tasas, inp: QuoteInput, cfg: FinancieraConfig): QuoteOutput {
  const refi = inp.refi ?? 0, terceros = inp.terceros ?? 0, tercerosM = inp.tercerosM ?? 0;
  const { cuotas, Y16, H25, H26, H27, H28, H31, H20, H32, H14, AF11, AB19 } = t;

  const F16 = xround(P7, 2) - refi - terceros;                           // suma a recibir
  const F17 = refi, F18 = terceros, F19 = xround(tercerosM, 2);
  const F20 = xround((((F16 + F17 + F19 + F18) / (1 - (H20 * H25))) * H25) * H20, 2); // ITBMS
  const G21 = F16 + F17 + F18 + F19 + F20;                               // monto obligación neta
  const F23 = xrounddown(AF11 * G21, 2);                                 // intereses
  const F25 = xround(G21 * H25, 2);                                      // comisión administrativa
  const F30 = cfg.notaria;                                               // notaría
  const F31 = xround(G21 > 5000 ? G21 * H31 * ((H14 * 30) / 360) : 0, 2);// FECI

  const sumF16F25 = F16 + F17 + F18 + F19 + F20 + F23 + F25;
  const H33 = (sumF16F25 + F30 + F31 + AB19) / (1 - H32);                // I33 = F34 = 0
  const F26 = xround(H33 * H26, 2) + 2 * AB19;                           // comisión promotor
  const F27 = xround(H33 * H27, 2);                                      // servicio de descuento
  const F28 = xroundup(H33 * H28, 1);                                    // timbres

  const G33 = F16 + F17 + F18 + F19 + F20 + F23 + F25 + F26 + F27 + F28 + F30 + F31; // total a pagar
  const C24 = xtrunc(xround(G33 / cuotas / 2, 2), 2);                    // letra quincenal

  return {
    cuotas, sumaARecibir: F16, itbms: F20, interes: F23, comisionAdmin: F25,
    comisionPromotor: F26, servicioDescuento: F27, timbres: F28, notaria: F30,
    feci: F31, montoNeta: G21, totalPagar: G33, letraQuincenal: C24,
    tasaInteresMensual: Y16, tasaComAdmin: H25, tasaComPromotor: H26, tasaServicio: H27,
    H32, H33, AF11,
  };
}

// Camino por MONTO: la obligación P7 = D2 (el monto solicitado).
export function cotizarPorMonto(inp: QuoteInput, cfg: FinancieraConfig): QuoteOutput {
  const monto = inp.monto ?? 0;
  const t = resolverTasas(inp, cfg, monto);
  return lineasDesdeP7(monto, t, inp, cfg);
}

// Camino por LETRA: se hace "gross-up" (M10) desde la letra quincenal deseada hasta la
// obligación, y luego se calculan los renglones igual que en el camino por monto.
export function cotizarPorLetra(inp: QuoteInput, cfg: FinancieraConfig): QuoteOutput {
  const letra = inp.letra ?? 0;
  const t = resolverTasas(inp, cfg, 0);                     // en camino por letra, D2 = 0 en G15
  const A = letra * t.cuotas * 2 * (1 - t.H32) - cfg.notaria - t.AB19; // total a pagar objetivo, neto
  const B1 = 1 + t.AF11 + t.H25;                            // sin FECI (obligación ≤ 5000)
  const B2 = 1 + t.AF11 + t.H25 + t.H31 * ((t.H14 * 30) / 360); // con FECI (obligación > 5000)
  const M10 = (A / B1 > 5000) ? A / B2 : A / B1;
  const M9 = M10 * t.H25 * t.H20;                           // M9 = M10·Y18·H20
  const P7 = M10 - M9;                                      // M7 = M10 - M9 (AF1 = 0), mismo orden que la hoja
  return lineasDesdeP7(P7, t, inp, cfg);
}

// F11 — Tope de letra quincenal por salario en Pago Automático (clave G11).
// esCSS = institución "Caja de Seguro Social" (tabla CSS); si no, tabla Contraloría.
export function topeLetraPagoAuto(salario: number, esCSS: boolean): number {
  if (esCSS) {
    if (salario > 1500) return 45;
    if (salario > 1000) return 35;
    if (salario > 800) return 25;
    if (salario > 700) return 20;
    if (salario > 499.99) return 15;
    return 0;
  }
  if (salario > 2500) return 99;
  if (salario > 2400) return 95;
  if (salario > 2200) return 90;
  if (salario > 2000) return 85;
  if (salario > 1900) return 75;
  if (salario > 1700) return 70;
  if (salario > 1500) return 65;
  if (salario > 1400) return 60;
  if (salario > 1200) return 55;
  if (salario > 1000) return 50;
  if (salario > 750) return 45;
  if (salario > 499.99) return 35;
  return 0;
}

function servicioRate(inp: QuoteInput, cfg: FinancieraConfig): number {
  switch (inp.clave) {
    case 'G8': return cfg.servicioRate.G8;
    case 'G9': return cfg.servicioRate.G9;
    case 'G10': return cfg.servicioRate.G10;
    case 'G11': return inp.esCSS ? cfg.servicioRate.G11_CSS : cfg.servicioRate.G11;
    case 'G12': return cfg.servicioRate.G12;
  }
}
