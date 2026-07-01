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
  monto: number;            // D2
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

export function cotizarPorMonto(inp: QuoteInput, cfg: FinancieraConfig): QuoteOutput {
  const refi = inp.refi ?? 0;
  const terceros = inp.terceros ?? 0;
  const tercerosM = inp.tercerosM ?? 0;
  const promCol = inp.promotorIdx - 1;

  // ----- Plazo efectivo (G14/G15), sin jubilación ni pago automático -----
  const tipoMax = cfg.tipoMaxPlazo[inp.tipoCode - 1];
  const G15 = inp.monto > 4000 ? 300 : tipoMax;          // camino Empresa Privada (G11=0)
  const cuotas = Math.min(inp.plazo, G15);                // G14

  // ----- Tasas resueltas por tipo × promotor / clave -----
  const Y16 = chooseTipo(cfg.matrizInteres, inp.tipoCode, promCol, 0.02);       // interés mensual (S53)
  const H25 = chooseTipo(cfg.matrizGastoCierre, inp.tipoCode, promCol, 0.25);   // comisión admin (S61)
  const S45 = chooseTipo(cfg.matrizComision, inp.tipoCode, promCol, 'row6');    // comisión promotor base (S45)
  const H26 = (inp.promotorNoTiene ? 0 : S45) * (Math.min(cuotas, cfg.amCap) / cuotas); // Y19
  const AB19 = inp.promotorIdx === 5 ? 100 : 0;                          // "Referido $100"
  const H27 = servicioRate(inp, cfg);                                    // Y20
  const H28 = cfg.timbresRate;                                           // Y25
  const H31 = cfg.feciRate;                                              // Y26
  const H20 = cfg.itbmsRate;                                             // Y23
  const H32 = H26 + H27 + H28;
  const H14 = cuotas / 12 + cuotas;
  const AF11 = Y16 * H14;                                                // interés plano (AF10=0)

  // ----- Renglones (AF1 = 0: ITBMS dentro) -----
  const F16 = xround(inp.monto, 2) - refi - terceros;                    // suma a recibir (P7 = D2)
  const F17 = refi, F18 = terceros, F19 = xround(tercerosM, 2);
  const F20 = xround((((F16 + F17 + F19 + F18) / (1 - (H20 * H25))) * H25) * H20, 2); // ITBMS
  const G21 = F16 + F17 + F18 + F19 + F20;                               // monto obligación neta
  const F23 = xrounddown(AF11 * G21, 2);                                 // intereses
  const F25 = xround(G21 * H25, 2);                                      // comisión administrativa
  const F30 = cfg.notaria;                                               // notaría
  const F31 = xround(G21 > 5000 ? G21 * H31 * ((H14 * 30) / 360) : 0, 2);// FECI

  const sumF16F25 = F16 + F17 + F18 + F19 + F20 + F23 + F25;
  const H33 = (sumF16F25 + F30 + F31 + AB19) / (1 - H32);                // I33 = F34 = 0
  const F26 = xround(H33 * H26, 2) + 2 * AB19;                           // comisión promotor (+2×AB19; I33=0)
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

function servicioRate(inp: QuoteInput, cfg: FinancieraConfig): number {
  switch (inp.clave) {
    case 'G8': return cfg.servicioRate.G8;
    case 'G9': return cfg.servicioRate.G9;
    case 'G10': return cfg.servicioRate.G10;
    case 'G11': return inp.esCSS ? cfg.servicioRate.G11_CSS : cfg.servicioRate.G11;
    case 'G12': return cfg.servicioRate.G12;
  }
}
