/* =============================================================================
   MOTOR POR CÓDIGO del Cotizador Fiflouu (reemplaza la hoja de cálculo).
   -----------------------------------------------------------------------------
   Ya no hay fórmulas ni evaluación de celdas: cada valor que la interfaz pide
   se calcula con las funciones de este archivo (portadas 1:1 del modelo y
   verificadas contra él). Las "celdas" que persisten son solo:
     - DATOS: la base de clientes (datos crudos).
     - Calculadora/Motor: parámetros de la financiera y entradas del usuario
       (valores literales; sirven de almacén de configuración con las mismas
       direcciones que usaba la hoja, para no tocar la interfaz).
   Expone la misma API que usaba la app (compatible con la anterior):
     HyperFormula.buildFromSheets(sheets) -> { getSheetNames, getSheetId,
       getCellValue, setCellContents, getCellSerialized, addRows }
   ========================================================================== */
(function () {
  'use strict';
  const EPOCH = Date.UTC(1899, 11, 30);
  const todaySerial = () => { const d = new Date(); return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 86400000); };
  const ERRV = (s) => ({ value: s, toString() { return s; } });
  const isE = (v) => v && typeof v === 'object' && typeof v.value === 'string' && v.value[0] === '#';
  // Redondeo estilo Excel (mitad hacia afuera; DOWN/TRUNC hacia cero; UP alejándose de cero)
  const xround = (x, d) => { if (!isFinite(x)) return x; const f = Math.pow(10, d); return Math.sign(x) * Math.floor(Math.abs(x) * f + 0.5) / f; };
  const xdown = (x, d) => { const f = Math.pow(10, d); return Math.sign(x) * Math.floor(Math.abs(x) * f) / f; };
  const xup = (x, d) => { const f = Math.pow(10, d); return Math.sign(x) * Math.ceil(Math.abs(x) * f) / f; };
  const xtrunc = (x, d) => xdown(x, d);
  function colLetter(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m - 1) / 26); } return s; }
  function colToNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
  const A1RE = /^([A-Z]+)(\d+)$/;

  function createModel(sheets) {
    const names = Object.keys(sheets);
    const grid = {}; names.forEach(n => grid[n] = sheets[n]);
    let cache = new Map();
    // Como en la hoja: escribir sobre una celda calculada la convierte en literal.
    const overrides = new Set();

    function raw(sh, c, r) { const g = grid[sh]; if (!g || r < 0 || r >= g.length) return null; const row = g[r]; if (!row || c < 0) return null; const v = row[c]; return v === undefined ? null : v; }
    function rawA1(sh, a1) { const m = A1RE.exec(a1); return raw(sh, colToNum(m[1]), (+m[2]) - 1); }

    // ---- coerciones / helpers de fórmula (propagan errores vía throw) ----
    const E = (v) => { if (isE(v)) throw { __err: v }; return v; };
    const num = (v) => { v = E(v); if (v == null || v === '') return 0; if (typeof v === 'boolean') return v ? 1 : 0; if (typeof v === 'number') return v; const f = parseFloat(v); if (isNaN(f)) throw { __err: ERRV('#VALUE!') }; return f; };
    const eqs = (a, b) => { a = E(a); b = E(b); if (typeof a === 'string' && typeof b === 'string') return a.toUpperCase() === b.toUpperCase(); return a === b; };

    // ---- demanda con memo ----
    function V(sh, a1) {
      const k = sh + '!' + a1;
      if (cache.has(k)) return cache.get(k);
      let v; const f = overrides.has(k) ? null : F[k];
      if (f) { try { v = f(); } catch (e) { if (e && e.__err) v = e.__err; else throw e; } }
      else v = rawA1(sh, a1);
      cache.set(k, v); return v;
    }
    const C = (a1) => V('Calculadora', a1);
    const M = (a1) => V('Motor', a1);
    const cn = (a1) => num(C(a1));
    const mn = (a1) => num(M(a1));

    // VLOOKUP exacto sobre DATOS!A5:R1990 (columna 1 = cédula)
    function dlook(key, col) {
      key = E(key); const g = grid['DATOS'];
      const kUp = typeof key === 'string' ? key.toUpperCase() : key;
      for (let r = 4; r < 1990 && r < g.length; r++) {
        const row = g[r]; if (!row) continue; const a = row[0]; if (a == null || a === '') continue;
        const hit = (typeof a === 'string' && typeof key === 'string') ? a.toUpperCase() === kUp : a === key;
        if (hit) { const v = row[col - 1]; return v === undefined ? null : v; }
      }
      throw { __err: ERRV('#N/A') };
    }
    // Índice de promotor: VLOOKUP(I1, Calculadora!L69:M73, 2)
    function promIdx() {
      const key = E(C('I1'));
      for (let r = 69; r <= 73; r++) { const lv = rawA1('Calculadora', 'L' + r); if (lv != null && eqs(lv, key)) return num(rawA1('Calculadora', 'M' + r)); }
      throw { __err: ERRV('#N/A') };
    }
    // Fila resuelta por promotor: R{n} = CHOOSE(promIdx, L{n},M{n},N{n},O{n},P{n})
    function Rrow(n) {
      const i = promIdx(); const col = ['L', 'M', 'N', 'O', 'P'][i - 1];
      if (!col) throw { __err: ERRV('#NUM!') };
      return num(C(col + n));   // via V: N88 es calculada
    }
    // Selector por tipo: filas r0..r0+5 = tipos 1..6; el tipo 7 (Eventual) usa un
    // literal o una fila auxiliar propia ({row:n}), según la matriz.
    function chooseTipo(r0, seventh) {
      const j = cn('J2'); const k = Math.trunc(j);
      if (k >= 1 && k <= 6) return Rrow(r0 + k - 1);
      if (k === 7) return (typeof seventh === 'number') ? seventh : Rrow(seventh.row);
      throw { __err: ERRV('#NUM!') };
    }
    const claveOn = (g) => cn(g) > 0;
    const esCSS = () => eqs(C('B11'), 'Caja de Seguro Social');

    /* ================= FÓRMULAS PORTADAS (mismo cálculo, en código) ================= */
    const F = {};
    const def = (k, fn) => { F[k] = fn; };
    const defC = (a1, fn) => def('Calculadora!' + a1, fn);
    const defM = (a1, fn) => def('Motor!' + a1, fn);

    // --- Cliente (VLOOKUP por cédula) ---
    defC('F2', () => dlook(C('F1'), 5));
    defC('F3', () => dlook(C('F1'), 6));
    defC('F4', () => dlook(C('F1'), 7));
    defC('F5', () => dlook(C('F1'), 8));
    defC('F6', () => dlook(C('F1'), 9));
    defC('B11', () => dlook(C('F1'), 10));
    defC('K1', () => dlook(C('F1'), 14));
    defM('B3', () => dlook(C('F1'), 2));
    defM('B4', () => dlook(C('F1'), 3));
    defM('B5', () => dlook(C('F1'), 1));
    defM('B6', () => dlook(C('F1'), 11));
    defC('B10', () => { const a = E(M('B3')), b = E(M('B4')); return (a == null ? '' : String(a)) + ' ' + (b == null ? '' : String(b)); });
    defM('B26', () => C('B11'));
    defM('C26', () => { // VLOOKUP(B26, Motor!B65:E141, 4, FALSE)
      const key = E(M('B26')); const kUp = typeof key === 'string' ? key.toUpperCase() : key;
      for (let r = 65; r <= 141; r++) { const b = rawA1('Motor', 'B' + r); if (b == null || b === '') continue; const hit = (typeof b === 'string' && typeof key === 'string') ? b.toUpperCase() === kUp : b === key; if (hit) return rawA1('Motor', 'E' + r); }
      throw { __err: ERRV('#N/A') };
    });

    // --- Institución / Pago Automático ---
    defC('E11', () => esCSS() ? 'Pago Automatico CSS' : 'Pago Automatico Contraloria');
    defC('F11', () => { const f2 = cn('F2');
      if (eqs(C('E11'), 'Pago Automatico Contraloria')) {
        return f2 > 2500 ? 99 : f2 > 2400 ? 95 : f2 > 2200 ? 90 : f2 > 2000 ? 85 : f2 > 1900 ? 75 : f2 > 1700 ? 70 : f2 > 1500 ? 65 : f2 > 1400 ? 60 : f2 > 1200 ? 55 : f2 > 1000 ? 50 : f2 > 750 ? 45 : f2 > 499.99 ? 35 : 0;
      }
      return f2 > 1500 ? 45 : f2 > 1000 ? 35 : f2 > 800 ? 25 : f2 > 700 ? 20 : f2 > 499.99 ? 15 : 0;
    });

    // --- Capacidad por clave ---
    defC('G5', () => xdown((cn('F2') - 100) * 0.15, 2) - cn('F5'));
    defC('G6', () => { const f5 = cn('F5'), f6 = cn('F6');
      if (f5 > 0) { if (cn('G5') > 0) return f6 - (xround((cn('F2') - 100) * 0.15, 2) - f5); return f6; } return f6; });
    defC('F8', () => { const v = (cn('F2') * 0.2 - cn('F3')) / 2; return xround(v < 0 ? 0 : v, 2); });
    defC('F9', () => { const v = (cn('F2') * 0.46625 - cn('F3')) / 2; return xround(v < 0 ? 0 : v, 2); });
    defC('F12', () => xdown((cn('F2') - 600) * 0.15 / 2, 2));
    defC('H8', () => claveOn('G8') ? cn('F8') : 0);
    defC('H9', () => claveOn('G9') ? cn('F9') : 0);
    defC('H10', () => { let inner = 0;
      if (claveOn('G10')) { const f2 = cn('F2'), f3 = cn('F3');
        inner = cn('F5') > 0 ? xdown(Math.max(0, (f2 * 0.2 - f3) / 2), 2) : xdown(Math.max(0, (f2 * 0.35 - f3) / 2), 2); }
      return xtrunc(inner, 2); });
    defC('H11', () => claveOn('G11') ? (cn('F4') > 0 ? 0 : cn('F11')) : 0);
    defC('H12', () => claveOn('G12') ? (cn('F5') > 0 ? 0 : cn('F12')) : 0);
    const capHalf = () => (cn('G6') - cn('F2') * 0.5) / 2;
    const cap25 = () => (cn('G6') - cn('F2') * 0.25) / 2;
    defC('I8', () => { const v = Math.min(capHalf(), cn('H8')); return v >= cn('N4') ? v : 0; });
    defC('I9', () => { const v = cn('H9'); return v >= cn('N4') ? v : 0; });
    defC('I10', () => { const v = Math.min(cap25(), cn('H10')); return xtrunc(v >= cn('N4') ? v : 0, 2); });
    defC('I11', () => { const v = Math.min(cap25(), cn('H11')); return xtrunc(v >= cn('N4') ? v : 0, 0); });
    defC('I12', () => { const v = Math.min(cap25(), cn('H12')); return v >= cn('N4') ? v : 0; });
    defC('J8', () => C('I8'));
    defC('J9', () => C('I9'));
    defC('J10', () => C('I10'));
    defC('J11', () => { const j = (cn('J10') + cn('I11')) < cap25() ? cn('I11') : (cap25() - cn('J10')); return j >= cn('N4') ? j : 0; });
    defC('J12', () => { const j = (cn('J10') + cn('I12') + cn('J11')) < cap25() ? cn('I12') : (cap25() - cn('J10') - cn('J11')); return (j > cn('F12') * cn('N6') && j >= cn('N4')) ? j : 0; });
    defC('J13', () => cn('J8') + cn('J9') + cn('J10') + cn('J11') + cn('J12'));
    defC('J14', () => xdown(cn('J13'), 2));

    // --- Jubilación ---
    defC('I5', () => eqs(C('I4'), 'Femenino') ? cn('I3') + cn('AI17') * 365.25 : cn('I3') + cn('AI18') * 365.25);
    defC('I6', () => (cn('I5') - todaySerial()) / 365.25 * 12);

    // --- Tipo de cliente / plazo ---
    defC('J2', () => { const key = E(C('I2'));
      for (let r = 55; r <= 62; r++) { const b = rawA1('Motor', 'B' + r); if (b != null && eqs(b, key)) return num(rawA1('Motor', 'C' + r)); }
      throw { __err: ERRV('#N/A') }; });
    defC('S21', () => { const j = Math.trunc(cn('J2')); if (j < 1 || j > 7) throw { __err: ERRV('#NUM!') }; return cn('R' + (20 + j)); });
    // Pago Automático: CSS máx 48 meses (decisión de negocio; antes 60 en la hoja,
    // aunque la app ya forzaba 48), Contraloría 72.
    defC('G15', () => claveOn('G11') ? (esCSS() ? 48 : 72) : (cn('D2') > 4000 ? 300 : cn('S21')));
    defC('G14', () => { const f14 = cn('F14');
      const inner = eqs(C('J6'), 'SI') ? (xtrunc(cn('I6'), 0) > f14 ? f14 : xtrunc(cn('I6'), 0)) : f14;
      const g15 = cn('G15'); return inner > g15 ? g15 : inner; });
    // H14 — meses de interés = cuotas + diciembres saltados del cronograma REAL
    // (igual que el sistema web y el cronograma de pagos: quincenas desde el primer
    // pago Motor!J12; diciembre no se paga, salvo Pago Automático CSS).
    // Respaldo: aproximación G14·13/12 si aún no hay fecha de primer pago.
    defC('H14', () => {
      const g14 = cn('G14');
      let firstS = 0; try { firstS = mn('J12'); } catch (e) { firstS = 0; }
      if (!(firstS > 0) || !(g14 > 0)) return g14 / 12 + g14;
      const exentoDic = claveOn('G11') && esCSS();
      const nPag = Math.round(g14 * 2);
      const d0 = new Date(EPOCH + Math.round(firstS) * 86400000);
      let mm = d0.getUTCMonth(), curII = d0.getUTCDate() > 15;
      let placed = 0, meses = 0, guard = 0;
      // meses de financiamiento = meses CALENDARIO desde el mes siguiente a la
      // cotización hasta el último pago (como el portal): incluye los meses de
      // "hueco" hasta el primer pago, el mes inicial parcial (primer pago en 2ª
      // quincena) y los diciembres saltados.
      const dHoy = new Date(EPOCH + todaySerial() * 86400000);
      const idx = (y, m) => y * 12 + m;
      const huecos = Math.max(0, idx(d0.getUTCFullYear(), d0.getUTCMonth()) - idx(dHoy.getUTCFullYear(), dHoy.getUTCMonth()) - 1);
      meses += huecos;
      while (placed < nPag && guard++ < 4000) {
        meses++;
        if (mm === 11 && !exentoDic) { /* diciembre: no se paga */ }
        else { placed += curII ? 1 : 2; }
        curII = false; mm++; if (mm > 11) mm = 0;
      }
      return meses;
    });

    // --- Tarifas por tipo × promotor ---
    defC('S37', () => claveOn('G12') ? C('S86') : chooseTipo(37, { row: 43 }));
    defC('S45', () => claveOn('G12') ? C('S94') : chooseTipo(45, { row: 52 }));
    defC('S53', () => claveOn('G12') ? C('S102') : chooseTipo(53, 0.02));
    defC('S61', () => claveOn('G12') ? C('S110') : chooseTipo(61, 0.25));
    defC('S86', () => chooseTipo(86, { row: 92 }));
    defC('S94', () => chooseTipo(94, { row: 100 }));
    defC('S102', () => chooseTipo(102, 0.02));
    defC('S110', () => chooseTipo(110, 0.25));
    defC('Y16', () => C('S53'));
    defC('Y18', () => C('S61'));
    defC('Y19', () => { const s45 = eqs(M('B6'), 'No tiene') ? 0 : num(C('S45'));
      const g14 = cn('G14'), am8 = cn('AM8'); return s45 * ((g14 > am8 ? am8 : g14) / g14); });
    defC('Y20', () => claveOn('G8') ? cn('AF6') : claveOn('G9') ? cn('AF7') : claveOn('G10') ? cn('AF5') : claveOn('G11') ? (esCSS() ? cn('AF4') : cn('AF3')) : claveOn('G12') ? cn('AF8') : cn('AF3'));
    defC('H20', () => C('Y23'));
    defC('H23', () => C('Y16'));
    defC('H25', () => C('Y18'));
    defC('H26', () => C('Y19'));
    defC('H27', () => C('Y20'));
    defC('H28', () => C('Y25'));
    defC('H31', () => C('Y26'));
    defC('H32', () => cn('H26') + cn('H28') + cn('H27'));
    defC('AF11', () => { const y16 = cn('Y16'), h14 = cn('H14');
      return cn('AF10') === 1 ? (y16 * h14) / (1 - Math.pow(1 + y16, -h14)) - 1 : y16 * h14; });
    defC('AB19', () => eqs(C('I1'), 'Referido $100') ? 100 : 0);

    // --- Umbral por clave (panel financiera) ---
    const claveRow = () => claveOn('G8') ? 5 : claveOn('G9') ? 6 : claveOn('G10') ? 4 : claveOn('G11') ? (esCSS() ? 3 : 2) : 7;
    defC('AM2', () => cn('AI' + claveRow()));
    defC('AM3', () => cn('AJ' + claveRow()));
    defC('AM4', () => cn('AK' + claveRow()));
    defC('AM5', () => cn('AM2') * cn('F2'));
    defC('AM6', () => claveOn('G8') ? 4 : claveOn('G9') ? 5 : claveOn('G10') ? 3 : claveOn('G11') ? (esCSS() ? 2 : 1) : 6);
    defC('AM8', () => { // INDEX(AI10:AO15, AM6, J2)
      const rowNum = 10 + Math.trunc(cn('AM6')) - 1, c = colToNum('AI') + Math.trunc(cn('J2')) - 1;
      if (rowNum < 10 || rowNum > 15 || c < colToNum('AI') || c > colToNum('AO')) throw { __err: ERRV('#REF!') };
      return num(raw('Calculadora', c, rowNum - 1)); });

    // --- Ruta de seguro (G19; normalmente "NO" -> 0) ---
    defC('C16', () => cn('D3') / cn('D16'));
    defC('C17', () => cn('D4') / cn('D17'));
    defC('C40', () => (((cn('D6') * 2 * cn('C37')) / (1 + cn('C39'))) / (1 + (cn('C37') * cn('C36')))) / cn('C38'));
    defC('C18', () => cn('C40') + cn('C16') + cn('D5') + cn('C17'));
    defC('C19', () => cn('D2') + cn('D5') + cn('C40') + cn('C16') + cn('C17'));
    defC('C21', () => cn('C19') * cn('S29'));
    defC('C22', () => cn('C19') + cn('C21'));
    const segOn = () => eqs(C('G19'), 'Si');
    defC('O3', () => segOn() ? (cn('C19') / (1 - ((1 + cn('S29')) * (cn('Y18') * cn('Y23'))))) * cn('S29') : 0);
    defC('O2', () => { if (!segOn()) return 0; const base = cn('C19') / (1 - ((1 + cn('S29')) * (cn('Y18') * cn('Y23')))); const v = base / 14; return v > cn('C18') ? v : cn('C18'); });
    defC('M3', () => segOn() ? (cn('M10') / (1 + cn('S29'))) * cn('S29') : 0);
    defC('M2', () => { if (!segOn()) return 0; const v = ((cn('M10') - ((cn('M10') / (1 + cn('S29'))) * cn('S29'))) / 14) * num(C('S37')); return v < 100 ? 100 : v; });
    defC('N3', () => segOn() ? (cn('N10') / (1 + cn('S29'))) * cn('S29') : 0);
    defC('N2', () => { if (!segOn()) return 0; const v = ((cn('N10') - ((cn('N10') / (1 + cn('S29'))) * cn('S29'))) / 14) * num(C('S37')); return v < 100 ? 100 : v; });
    defC('M8', () => cn('M2') + cn('M3'));
    defC('N8', () => cn('N2') + cn('N3'));
    defC('O8', () => cn('O2') + cn('O3'));
    defC('M9', () => cn('M10') * cn('Y18') * cn('H20'));
    defC('N9', () => cn('N10') * cn('Y18') * cn('H20'));
    function grossUp(baseLetra) { // M10/N10: obligación desde letra (idéntico a la hoja)
      const A = ((baseLetra * cn('G14') * 2) * (1 - (cn('Y19') + cn('Y20') + cn('Y25')))) - 25 - cn('AB19');
      const afTerm = cn('AF1') === 1 ? (cn('Y18') * cn('Y23') * (1 - (cn('Y19') + cn('Y20') + cn('Y25')))) : 0;
      const B1 = 1 + (cn('AF11')) + (cn('Y18')) + afTerm;
      const B2 = 1 + (cn('AF11')) + (cn('Y18')) + (cn('Y26') * ((cn('H14') * 30) / 360)) + afTerm;
      return (A / B1 > 5000) ? A / B2 : A / B1;
    }
    defC('M10', () => grossUp(cn('D8')));
    defC('N10', () => grossUp(cn('J13')));
    defC('M7', () => cn('AF1') === 1 ? cn('M10') - cn('M8') : cn('M10') - cn('M8') - cn('M9'));
    defC('N7', () => cn('AF1') === 1 ? cn('N10') - cn('N8') : cn('N10') - cn('N8') - cn('N9'));
    defC('O7', () => C('D2'));
    const pSel = (m, o, n2) => cn('D8') > 0 ? C(m) : (cn('D2') > 0 ? C(o) : C(n2));
    defC('P2', () => pSel('M2', 'O2', 'N2'));
    defC('P3', () => pSel('M3', 'O3', 'N3'));
    defC('P7', () => pSel('M7', 'O7', 'N7'));
    defC('P8', () => pSel('M8', 'O8', 'N8'));

    // --- Cascada de la cotización ---
    defC('F16', () => xround(cn('P7'), 2) - cn('F17') - cn('F18'));
    defC('F19', () => xround(cn('P8'), 2));
    defC('F20', () => { const b = cn('F16') + cn('F17') + cn('F18') + cn('F19');
      return cn('AF1') === 1 ? xround(b * cn('H25') * cn('H20'), 2)
        : xround((((cn('F16') + cn('F17') + cn('F19') + cn('F18')) / (1 - (cn('H20') * cn('H25')))) * cn('H25')) * cn('H20'), 2); });
    defC('G21', () => cn('AF1') === 1 ? (cn('F16') + cn('F17') + cn('F18') + cn('F19')) : (cn('F16') + cn('F17') + cn('F18') + cn('F19') + cn('F20')));
    defC('F23', () => xdown(cn('AF11') * cn('G21'), 2));
    defC('F25', () => xround(cn('G21') * cn('H25'), 2));
    defC('F31', () => xround(cn('G21') > 5000 ? cn('G21') * cn('H31') * ((cn('H14') * 30) / 360) : 0, 2));
    // Notaría: residual de reconciliación (como el portal) en TODOS los modos.
    // La letra queda redondeada a centavos, total = letra × cuotas × 2 EXACTO y la
    // notaría absorbe el residuo (flexiona alrededor de la base). En modo por monto,
    // además, el recibido en mano queda igual al monto solicitado exacto.
    const notariaBase = () => num(rawA1('Calculadora', 'F30'));
    defC('F30', () => {
      const resto = cn('F16') + cn('F17') + cn('F18') + cn('F19') + cn('F20') + cn('F23') + cn('F25') + cn('F26') + cn('F27') + cn('F28') + cn('F31');
      let letra;
      if (cn('D8') > 0) letra = cn('D8');
      else {
        const g33base = resto + notariaBase();               // total con notaría base
        letra = xtrunc(xround(g33base / cn('G14') / 2, 2), 2); // letra redondeada a centavos
      }
      return xround(letra * cn('G14') * 2 - resto, 2);
    });
    defC('H33', () => { const sum = cn('F16') + cn('F17') + cn('F18') + cn('F19') + cn('F20') + cn('F23') + cn('F25');
      return (sum - (cn('AF1') === 1 ? cn('F20') : 0) + notariaBase() + cn('F31') + cn('AB19')) / (1 - cn('H32')); });
    defC('I33', () => C('F34'));
    defC('F26', () => (xround(cn('H33') * cn('H26'), 2) + cn('AB19')) - cn('I33') + cn('AB19'));
    defC('F27', () => xround(cn('H33') * cn('H27'), 2));
    defC('F28', () => xup(cn('H33') * cn('H28'), 1));
    defC('G33', () => cn('F16') + cn('F17') + cn('F18') + cn('F19') + cn('F20') + cn('F23') + cn('F25') + cn('F26') + cn('F27') + cn('F28') + cn('F30') + cn('F31'));
    defC('C24', () => xtrunc(xround(cn('G33') / cn('G14') / 2, 2), 2));
    defC('C26', () => (cn('F25') + cn('F26') + cn('F27') + cn('F28')) / cn('G21'));
    defC('C27', () => cn('F16') + cn('F17') + cn('F18') + (cn('F19') - cn('P3')) + cn('F20') + cn('F26') + cn('F27') + cn('F28') + cn('F30'));
    defC('H15', () => M('J13'));
    defC('C25', () => M('P22'));

    // --- Motor: fechas de planilla y cronograma TIR ---
    defM('J10', () => { const s = mn('I10'); const y = new Date(EPOCH + Math.round(s) * 86400000).getUTCFullYear();
      return Math.round((Date.UTC(y, 11, 31) - EPOCH) / 86400000); });
    defM('J11', () => M('J10'));
    defM('J13', () => (cn('H14')) * (365 / 12) + mn('J12') + mn('J14') - 15);
    defM('K8', () => C('W9'));
    defM('Q9', () => { const g14 = cn('G14'), k8 = mn('K8'); return g14 < k8 ? g14 : k8; });
    for (let i = 10; i <= 21; i++) {
      (function (row) {
        defM('Q' + row, () => { const g14 = cn('G14'), k8 = mn('K8');
          let prev = 0; for (let q = 9; q < row; q++) prev += mn('Q' + q);
          return g14 > (k8 + prev) ? k8 : (g14 - prev); });
      })(i);
    }
    defM('P8', () => -(cn('G21') + cn('F26') + cn('F27') + cn('F28') + cn('F30')));
    for (let i = 9; i <= 21; i++) {
      (function (row) { defM('P' + row, () => xround(cn('C24'), 2) * 2 * mn('Q' + row)); })(i);
    }
    defM('P22', () => { const vals = []; for (let r = 8; r <= 21; r++) vals.push(mn('P' + r)); return irr(vals); });
    function irr(vals) {
      const npv = (rate) => { let s = 0; for (let i = 0; i < vals.length; i++) s += vals[i] / Math.pow(1 + rate, i); return s; };
      let r = 0.1;
      for (let it = 0; it < 80; it++) { const f = npv(r); const df = (npv(r + 1e-7) - f) / 1e-7; if (Math.abs(df) < 1e-14) break; const nr = r - f / df; if (!isFinite(nr) || nr <= -1) break; if (Math.abs(nr - r) < 1e-10) { r = nr; break; } r = nr; }
      if (isFinite(r) && r > -1 && Math.abs(npv(r)) < 1e-6) return r;
      let lo = -0.999999, hi = 10, flo = npv(lo), fhi = npv(hi);
      if (flo * fhi > 0) throw { __err: ERRV('#NUM!') };
      for (let it = 0; it < 200; it++) { const mid = (lo + hi) / 2, fm = npv(mid); if (Math.abs(fm) < 1e-10) return mid; if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
      return (lo + hi) / 2;
    }

    // ---------- API compatible ----------
    return {
      getSheetNames: () => names.slice(),
      getSheetId: (nm) => names.indexOf(nm),
      getCellValue: ({ sheet, col, row }) => { const v = V(names[sheet], colLetter(col) + (row + 1)); return v === undefined ? null : v; },
      setCellContents: ({ sheet, col, row }, content) => {
        const v = Array.isArray(content) ? content[0][0] : content;
        const sh = names[sheet]; const g = grid[sh]; if (!g[row]) g[row] = []; g[row][col] = v;
        const k = sh + '!' + colLetter(col) + (row + 1);
        // F30 (notaría) no se pisa: el panel edita la BASE (valor crudo) y la
        // reconciliación por letra sigue operando sobre esa base.
        if (F[k] && k !== 'Calculadora!F30') overrides.add(k);   // pisa la celda calculada, como en la hoja
        cache = new Map();
      },
      getCellSerialized: ({ sheet, col, row }) => { const v = raw(names[sheet], col, row); return v === undefined ? null : v; },
      addRows: (sheetId, args) => { const idx = args[0], count = args[1]; const g = grid[names[sheetId]]; const cols = g[0] ? g[0].length : 23; for (let i = 0; i < count; i++) g.splice(idx, 0, Array(cols).fill(null)); cache = new Map(); },
    };
  }

  window.HyperFormula = { buildFromSheets: (sheets) => createModel(sheets) };
})();
