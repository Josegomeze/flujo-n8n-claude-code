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
  // Matrices de la variante Descuento Voluntario (clave G12): S94 / S102 / S110
  matrizComisionVol: number[][];
  matrizInteresVol: number[][];
  matrizGastoCierreVol: number[][];
  // Jubilación
  jubilaAplica: boolean;    // J6 === 'SI'
  edadJubMujer: number;     // AI17
  edadJubHombre: number;    // AI18
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
  itbmsFuera?: boolean;     // AF1 = 1 (ITBMS fuera de interés/comisión)
  interesCompuesto?: boolean; // AF10 = 1 (interés compuesto en vez de plano)
  // Jubilación (solo si cfg.jubilaAplica): tope de plazo por meses hasta pensión
  fnacSerial?: number;      // I3 fecha de nacimiento (serial Excel)
  genero?: 'Masculino' | 'Femenino'; // I4
  todaySerial?: number;     // TODAY() (serial Excel) usado por I6
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

// G14 — cuotas efectivas: plazo solicitado, topado por jubilación (meses hasta pensión)
// y por el máximo por tipo/pago-automático (G15).
function calcCuotas(inp: QuoteInput, cfg: FinancieraConfig, montoParaG15: number): number {
  const tipoMax = cfg.tipoMaxPlazo[inp.tipoCode - 1];
  const G15 = inp.clave === 'G11' ? (inp.esCSS ? 60 : 72) : (montoParaG15 > 4000 ? 300 : tipoMax);
  let base = inp.plazo;
  if (cfg.jubilaAplica) {
    const retAge = inp.genero === 'Femenino' ? cfg.edadJubMujer : cfg.edadJubHombre;
    const I5 = (inp.fnacSerial ?? 0) + retAge * 365.25;                // fecha de jubilación (serial)
    const I6 = (I5 - (inp.todaySerial ?? 0)) / 365.25 * 12;            // meses hasta pensión
    base = Math.min(Math.trunc(I6), inp.plazo);                        // TRUNC(I6,0)
  }
  return Math.min(base, G15);
}

// montoParaG15: valor de D2 que ve G15 (= monto en camino por monto; 0 en camino por letra).
function resolverTasas(inp: QuoteInput, cfg: FinancieraConfig, montoParaG15: number): Tasas {
  const promCol = inp.promotorIdx - 1;
  const cuotas = calcCuotas(inp, cfg, montoParaG15);

  // Clave Voluntario (G12) usa las matrices de la variante (S94/S102/S110).
  const vol = inp.clave === 'G12';
  const mComision = vol ? cfg.matrizComisionVol : cfg.matrizComision;
  const mInteres = vol ? cfg.matrizInteresVol : cfg.matrizInteres;
  const mGasto = vol ? cfg.matrizGastoCierreVol : cfg.matrizGastoCierre;

  const Y16 = chooseTipo(mInteres, inp.tipoCode, promCol, 0.02);
  const H25 = chooseTipo(mGasto, inp.tipoCode, promCol, 0.25);
  const S45 = chooseTipo(mComision, inp.tipoCode, promCol, 'row6');
  const H26 = (inp.promotorNoTiene ? 0 : S45) * (Math.min(cuotas, cfg.amCap) / cuotas);
  const H27 = servicioRate(inp, cfg);
  const H28 = cfg.timbresRate;
  const H31 = cfg.feciRate;
  const H20 = cfg.itbmsRate;
  const H14 = cuotas / 12 + cuotas;
  // AF11: interés plano (AF10=0) o compuesto (AF10=1)
  const AF11 = inp.interesCompuesto
    ? (Y16 * H14) / (1 - Math.pow(1 + Y16, -H14)) - 1
    : Y16 * H14;
  return {
    cuotas, Y16, H25, H26, H27, H28, H31, H20,
    H32: H26 + H27 + H28, H14, AF11,
    AB19: inp.promotorIdx === 5 ? 100 : 0,
  };
}

// Renglones desde la obligación P7 (idéntico en ambos caminos; AF1 = 0, ITBMS dentro).
function lineasDesdeP7(P7: number, t: Tasas, inp: QuoteInput, cfg: FinancieraConfig): QuoteOutput {
  const refi = inp.refi ?? 0, terceros = inp.terceros ?? 0, tercerosM = inp.tercerosM ?? 0;
  const { cuotas, Y16, H25, H26, H27, H28, H31, H20, H32, H14, AF11, AB19 } = t;

  const itbmsFuera = inp.itbmsFuera ?? false;
  const F16 = xround(P7, 2) - refi - terceros;                           // suma a recibir
  const F17 = refi, F18 = terceros, F19 = xround(tercerosM, 2);
  const F20 = itbmsFuera                                                 // ITBMS
    ? xround((F16 + F17 + F18 + F19) * H25 * H20, 2)
    : xround((((F16 + F17 + F19 + F18) / (1 - (H20 * H25))) * H25) * H20, 2);
  const G21 = itbmsFuera                                                 // monto obligación neta
    ? (F16 + F17 + F18 + F19)
    : (F16 + F17 + F18 + F19 + F20);
  const F23 = xrounddown(AF11 * G21, 2);                                 // intereses
  const F25 = xround(G21 * H25, 2);                                      // comisión administrativa
  const F30 = cfg.notaria;                                               // notaría
  const F31 = xround(G21 > 5000 ? G21 * H31 * ((H14 * 30) / 360) : 0, 2);// FECI

  const sumF16F25 = F16 + F17 + F18 + F19 + F20 + F23 + F25;
  const H33 = (sumF16F25 - (itbmsFuera ? F20 : 0) + F30 + F31 + AB19) / (1 - H32); // I33 = F34 = 0
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
  const itbmsFuera = inp.itbmsFuera ?? false;
  const t = resolverTasas(inp, cfg, 0);                     // en camino por letra, D2 = 0 en G15
  const afTerm = itbmsFuera ? t.H25 * t.H20 * (1 - t.H32) : 0; // término AF1 del denominador
  const A = letra * t.cuotas * 2 * (1 - t.H32) - cfg.notaria - t.AB19; // total a pagar objetivo, neto
  const B1 = 1 + t.AF11 + t.H25 + afTerm;                   // sin FECI (obligación ≤ 5000)
  const B2 = 1 + t.AF11 + t.H25 + t.H31 * ((t.H14 * 30) / 360) + afTerm; // con FECI (obligación > 5000)
  const M10 = (A / B1 > 5000) ? A / B2 : A / B1;
  const M9 = M10 * t.H25 * t.H20;                           // M9 = M10·Y18·H20
  const P7 = itbmsFuera ? M10 : M10 - M9;                   // M7 = AF1 ? M10-M8 : M10-M8-M9 (M8=0)
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

// Datos financieros crudos del cliente (columnas de DATOS).
export interface ClienteFin {
  salario: number;      // F2 (col 5)
  descComercial: number;// F3 (col 6)
  claveN147: number;    // F4 (col 7)
  embargos: number;     // F5 (col 8)
  descontable: number;  // F6 (col 9)
}

// Capacidad quincenal máxima del cliente (J13 sin redondear, J14 = ROUNDDOWN(J13,2)).
// El camino "por capacidad" (N7) equivale al camino por letra con letra = J13.
export function capacidadQuincenal(
  fin: ClienteFin, clave: ClaveKey, esCSS: boolean,
): { J13: number; J14: number } {
  const { salario: F2, descComercial: F3, claveN147: F4, embargos: F5, descontable: F6 } = fin;
  const N4 = 5, N6 = 0.74;
  const F8 = xround(Math.max(0, (F2 * 0.2 - F3) / 2), 2);
  const F9 = xround(Math.max(0, (F2 * 0.46625 - F3) / 2), 2);
  const F11 = topeLetraPagoAuto(F2, esCSS);
  const F12 = xrounddown((F2 - 600) * 0.15 / 2, 2);
  const G5 = xrounddown((F2 - 100) * 0.15, 2) - F5;
  const G6 = F5 > 0 ? (G5 > 0 ? F6 - (xround((F2 - 100) * 0.15, 2) - F5) : F6) : F6;

  const H8 = clave === 'G8' ? F8 : 0;
  const H9 = clave === 'G9' ? F9 : 0;
  const H10 = xtrunc(clave === 'G10'
    ? (F5 > 0 ? xrounddown(Math.max(0, (F2 * 0.2 - F3) / 2), 2)
              : xrounddown(Math.max(0, (F2 * 0.35 - F3) / 2), 2))
    : 0, 2);
  const H11 = clave === 'G11' ? (F4 > 0 ? 0 : F11) : 0;
  const H12 = clave === 'G12' ? (F5 > 0 ? 0 : F12) : 0;

  const capHalf = (G6 - F2 * 0.5) / 2;   // (G6 - F2·0.5)/2  (I8)
  const cap25 = (G6 - F2 * 0.25) / 2;    // (G6 - F2·0.25)/2 (I10..I12)
  const v8 = Math.min(capHalf, H8); const I8 = v8 >= N4 ? v8 : 0;
  const I9 = H9 >= N4 ? H9 : 0;
  const v10 = Math.min(cap25, H10); const I10 = xtrunc(v10 >= N4 ? v10 : 0, 2);
  const v11 = Math.min(cap25, H11); const I11 = xtrunc(v11 >= N4 ? v11 : 0, 0);
  const v12 = Math.min(cap25, H12); const I12 = v12 >= N4 ? v12 : 0;

  const J8 = I8, J9 = I9, J10 = I10;
  const j11v = (J10 + I11) < cap25 ? I11 : (cap25 - J10);
  const J11 = j11v >= N4 ? j11v : 0;
  const j12v = (J10 + I12 + J11) < cap25 ? I12 : (cap25 - J10 - J11);
  const J12 = (j12v > F12 * N6 && j12v >= N4) ? j12v : 0;

  const J13 = J8 + J9 + J10 + J11 + J12;
  return { J13, J14: xrounddown(J13, 2) };
}

// Camino por CAPACIDAD (N7): la letra sale de la capacidad máxima del cliente (J13),
// y el resto del cálculo es idéntico al camino por letra.
export function cotizarPorCapacidad(fin: ClienteFin, inp: QuoteInput, cfg: FinancieraConfig): QuoteOutput {
  const { J13 } = capacidadQuincenal(fin, inp.clave, inp.esCSS);
  return cotizarPorLetra({ ...inp, letra: J13 }, cfg);
}

// Letra quincenal aplicada en Pago Automático: la solicitada se redondea a dólar entero
// hacia arriba, sin exceder el mínimo entre el tope por salario (F11) y la capacidad (J13).
// Refleja la lógica de la app (enforceTopePagoAuto); alimenta el camino por letra.
export function letraAplicadaPagoAuto(
  letraSolicitada: number, salario: number, esCSS: boolean, capacidadJ13: number,
): number {
  const limite = Math.min(topeLetraPagoAuto(salario, esCSS), capacidadJ13);
  const floorLim = Math.floor(limite);
  const ceilReq = Math.ceil(letraSolicitada - 1e-6);
  return ceilReq <= floorLim ? ceilReq : floorLim;
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
