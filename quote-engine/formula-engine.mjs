// Motor de fórmulas propio (reemplazo de HyperFormula, sin GPL).
// Evalúa las MISMAS fórmulas del libro y expone la misma interfaz que usa el v76:
//   HyperFormula.buildFromSheets(sheets,opts) -> { getSheetNames, getSheetId,
//   getCellValue, setCellContents, getCellSerialized, addRows }
// Celdas y API con col/row 0-indexados (como HyperFormula en el v76).

// ---------- errores ----------
const ERR = (v) => ({ value: v, __err: true });
const isErr = (v) => v && typeof v === 'object' && v.__err === true;
const EPOCH = Date.UTC(1899, 11, 30);
const todaySerial = () => { const d = new Date(); return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 86400000); };

// ---------- redondeo estilo Excel ----------
const xround = (x, d) => { if (!isFinite(x)) return x; const f = 10 ** d; return Math.sign(x) * Math.floor(Math.abs(x) * f + 0.5) / f; };
const xtrunc = (x, d = 0) => { const f = 10 ** d; return Math.sign(x) * Math.floor(Math.abs(x) * f) / f; };
const xrdown = (x, d) => { const f = 10 ** d; return Math.sign(x) * Math.floor(Math.abs(x) * f) / f; };
const xrup = (x, d) => { const f = 10 ** d; return Math.sign(x) * Math.ceil(Math.abs(x) * f) / f; };

// ---------- utilidades de columnas ----------
function colToNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }

// ================= TOKENIZER =================
function tokenize(src) {
  const toks = []; let i = 0; const n = src.length;
  const isDigit = c => c >= '0' && c <= '9';
  const isAlpha = c => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_' || c === '.';
  while (i < n) {
    let c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '"') { let j = i + 1, s = ''; while (j < n) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += src[j++]; } i = j + 1; toks.push({ t: 'str', v: s }); continue; }
    if (c === "'") { let j = i + 1, s = ''; while (j < n && src[j] !== "'") s += src[j++]; i = j + 1; toks.push({ t: 'sheet', v: s }); continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i; while (j < n && (isDigit(src[j]) || src[j] === '.')) j++;
      if (src[j] === 'e' || src[j] === 'E') { j++; if (src[j] === '+' || src[j] === '-') j++; while (j < n && isDigit(src[j])) j++; }
      toks.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue;
    }
    if (isAlpha(c) || c === '$') {
      let j = i; while (j < n && (isAlpha(src[j]) || isDigit(src[j]) || src[j] === '$')) j++;
      toks.push({ t: 'name', v: src.slice(i, j) }); i = j; continue;
    }
    // operadores de 2 chars
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/^&=<>(),:%!'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    i++; // ignora desconocido
  }
  return toks;
}

// ================= PARSER (a AST) =================
function parse(src) {
  const toks = tokenize(src); let p = 0;
  const peek = () => toks[p], next = () => toks[p++];
  const expect = v => { const t = next(); if (!t || t.v !== v) throw new Error('esperaba ' + v); };

  function parseExpr() { return parseCmp(); }
  function parseCmp() { let l = parseConcat(); while (peek() && peek().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) { const op = next().v; l = { k: 'bin', op, l, r: parseConcat() }; } return l; }
  function parseConcat() { let l = parseAdd(); while (peek() && peek().v === '&') { next(); l = { k: 'bin', op: '&', l, r: parseAdd() }; } return l; }
  function parseAdd() { let l = parseMul(); while (peek() && (peek().v === '+' || peek().v === '-')) { const op = next().v; l = { k: 'bin', op, l, r: parseMul() }; } return l; }
  function parseMul() { let l = parsePow(); while (peek() && (peek().v === '*' || peek().v === '/')) { const op = next().v; l = { k: 'bin', op, l, r: parsePow() }; } return l; }
  function parsePow() { let l = parseUnary(); while (peek() && peek().v === '^') { next(); l = { k: 'bin', op: '^', l, r: parseUnary() }; } return l; }
  function parseUnary() { if (peek() && (peek().v === '-' || peek().v === '+')) { const op = next().v; return { k: 'unary', op, e: parseUnary() }; } return parsePostfix(); }
  function parsePostfix() { let e = parsePrimary(); while (peek() && peek().v === '%') { next(); e = { k: 'pct', e }; } return e; }

  function parsePrimary() {
    const t = peek();
    if (!t) throw new Error('fin inesperado');
    if (t.t === 'num') { next(); return { k: 'num', v: t.v }; }
    if (t.t === 'str') { next(); return { k: 'str', v: t.v }; }
    if (t.v === '(') { next(); const e = parseExpr(); expect(')'); return e; }
    if (t.t === 'sheet') { // 'Sheet Name'!ref
      next(); expect('!'); return parseRefFrom(t.v);
    }
    if (t.t === 'name') {
      // función?  nombre seguido de '('
      const save = p; const name = next().v;
      if (peek() && peek().v === '(') { next(); const args = parseArgs(); expect(')'); return { k: 'call', name: name.toUpperCase(), args }; }
      if (peek() && peek().v === '!') { next(); return parseRefFrom(name); } // Sheet!ref (bare)
      // TRUE / FALSE literales
      if (name.toUpperCase() === 'TRUE') return { k: 'bool', v: true };
      if (name.toUpperCase() === 'FALSE') return { k: 'bool', v: false };
      p = save; return parseRefFrom(null);
    }
    throw new Error('token inesperado ' + JSON.stringify(t));
  }
  function parseArgs() {
    const args = [];
    const argOrEmpty = () => (peek() && (peek().v === ',' || peek().v === ')')) ? { k: 'empty' } : parseExpr();
    if (peek() && peek().v === ')') return args;
    args.push(argOrEmpty());
    while (peek() && peek().v === ',') { next(); args.push(argOrEmpty()); }
    return args;
  }
  function parseRefFrom(sheet) {
    // ref: $?LETTERS$?DIGITS ; puede ser rango ref:ref
    const a = readRef();
    if (peek() && peek().v === ':') { next(); const b = readRef(); return { k: 'range', sheet, a, b }; }
    return { k: 'ref', sheet, a };
  }
  function readRef() {
    const t = next(); // name token con posibles $ y dígitos
    const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(t.v);
    if (!m) throw new Error('ref inválida ' + t.v);
    return { col: colToNum(m[1].toUpperCase()), row: (+m[2]) - 1 };
  }
  const ast = parseExpr();
  return ast;
}

// ================= ENGINE =================
function createEngine(sheets) {
  const names = Object.keys(sheets);
  const idOf = {}; names.forEach((n, i) => idOf[n] = i);
  const nameOf = names.slice();
  // HyperFormula convierte contenidos string como "02", "25%", "00:00:00" a números.
  function coerceRaw(v) {
    if (typeof v !== 'string' || v[0] === '=') return v;
    if (/^-?\d+(\.\d+)?%$/.test(v)) return parseFloat(v) / 100;
    if (/^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(v)) { const [h, m, s] = v.split(':').map(Number); return (h * 3600 + m * 60 + s) / 86400; }
    return v;
  }
  // grid[name] = 2D array de contenidos crudos (valor o "=formula")
  const grid = {}; for (const n of names) grid[n] = sheets[n].map(row => row.map(coerceRaw));
  // cache de valores calculados + AST
  let cache = {}; const astCache = {};
  const computing = new Set();

  const keyOf = (n, r, c) => n + '!' + r + ',' + c;
  function raw(n, r, c) { const g = grid[n]; if (!g || r < 0 || r >= g.length) return null; const row = g[r]; if (!row || c < 0 || c >= row.length) return null; const v = row[c]; return v === undefined ? null : v; }
  function astFor(formula) { if (!(formula in astCache)) { try { astCache[formula] = parse(formula.slice(1)); } catch (e) { astCache[formula] = { k: 'err', v: '#ERROR!' }; } } return astCache[formula]; }

  function getVal(n, r, c) {
    const k = keyOf(n, r, c);
    if (k in cache) return cache[k];
    const v = raw(n, r, c);
    if (typeof v === 'string' && v[0] === '=') {
      if (computing.has(k)) { cache[k] = ERR('#CYCLE!'); return cache[k]; }
      computing.add(k);
      let res; try { res = evalNode(astFor(v), n); } catch (e) { res = ERR('#ERROR!'); }
      computing.delete(k);
      cache[k] = res; return res;
    }
    cache[k] = (v === undefined ? null : v); return cache[k];
  }

  // ---- coerciones ----
  const num = (v) => { if (isErr(v)) return v; if (v === null || v === undefined || v === '') return 0; if (typeof v === 'boolean') return v ? 1 : 0; if (typeof v === 'number') return v; const f = parseFloat(v); return isNaN(f) ? ERR('#VALUE!') : f; };
  const str = (v) => { if (isErr(v)) return v; if (v === null || v === undefined) return ''; if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO'; return String(v); };
  const bool = (v) => { if (isErr(v)) return v; if (typeof v === 'boolean') return v; if (typeof v === 'number') return v !== 0; if (v === null || v === '') return false; return !!v; };

  function evalNode(node, sheet) {
    switch (node.k) {
      case 'num': return node.v;
      case 'str': return node.v;
      case 'bool': return node.v;
      case 'empty': return null;
      case 'err': return ERR(node.v);
      case 'ref': return getVal(node.sheet || sheet, node.a.row, node.a.col);
      case 'range': return { __range: true, sheet: node.sheet || sheet, r1: node.a.row, c1: node.a.col, r2: node.b.row, c2: node.b.col };
      case 'pct': { const e = evalNode(node.e, sheet); const nn = num(e); return isErr(nn) ? nn : nn / 100; }
      case 'unary': { const e = evalNode(node.e, sheet); const nn = num(e); if (isErr(nn)) return nn; return node.op === '-' ? -nn : nn; }
      case 'bin': return evalBin(node, sheet);
      case 'call': return evalCall(node, sheet);
    }
    return ERR('#ERROR!');
  }

  function evalBin(node, sheet) {
    const op = node.op;
    const L = evalNode(node.l, sheet), R = evalNode(node.r, sheet);
    if (isErr(L)) return L; if (isErr(R)) return R;
    if (op === '&') return str(L) + str(R);
    if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
      let a = L, b = R;
      if (typeof a === 'number' || typeof b === 'number') { a = num(a); b = num(b); if (isErr(a)) a = L; if (isErr(b)) b = R; }
      if (typeof a === 'string' && typeof b === 'string') { a = a.toUpperCase(); b = b.toUpperCase(); }
      if (a === null) a = (typeof b === 'number') ? 0 : (typeof b === 'string' ? '' : a);
      if (b === null) b = (typeof a === 'number') ? 0 : (typeof a === 'string' ? '' : b);
      switch (op) { case '=': return a === b; case '<>': return a !== b; case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b; }
    }
    const a = num(L), b = num(R); if (isErr(a)) return a; if (isErr(b)) return b;
    switch (op) {
      case '+': return a + b; case '-': return a - b; case '*': return a * b;
      case '/': return b === 0 ? ERR('#DIV/0!') : a / b; case '^': return Math.pow(a, b);
    }
    return ERR('#ERROR!');
  }

  // valores de un rango como array plano (para SUM, etc.)
  function rangeVals(rg) { const out = []; for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) out.push(getVal(rg.sheet, r, c)); return out; }

  function evalCall(node, sheet) {
    const name = node.name, args = node.args;
    const ev = i => evalNode(args[i], sheet);
    switch (name) {
      case 'TRUE': return true; case 'FALSE': return false; case 'TODAY': return todaySerial();
      case 'IF': { const c = bool(ev(0)); if (isErr(c)) return c; if (c) return ev(1); return args.length > 2 ? ev(2) : false; }
      case 'AND': { for (let i = 0; i < args.length; i++) { const v = bool(ev(i)); if (isErr(v)) return v; if (!v) return false; } return true; }
      case 'OR': { for (let i = 0; i < args.length; i++) { const v = bool(ev(i)); if (isErr(v)) return v; if (v) return true; } return false; }
      case 'NOT': { const v = bool(ev(0)); return isErr(v) ? v : !v; }
      case 'CHOOSE': { const idx = num(ev(0)); if (isErr(idx)) return idx; const k = Math.trunc(idx); if (k < 1 || k > args.length - 1) return ERR('#NUM!'); return ev(k); }
      case 'CONCATENATE': { let s = ''; for (let i = 0; i < args.length; i++) { const v = ev(i); if (isErr(v)) return v; s += str(v); } return s; }
      case 'ROUND': { const x = num(ev(0)), d = num(ev(1)); if (isErr(x)) return x; if (isErr(d)) return d; return xround(x, d); }
      case 'ROUNDDOWN': { const x = num(ev(0)), d = num(ev(1)); if (isErr(x)) return x; if (isErr(d)) return d; return xrdown(x, d); }
      case 'ROUNDUP': { const x = num(ev(0)), d = num(ev(1)); if (isErr(x)) return x; if (isErr(d)) return d; return xrup(x, d); }
      case 'TRUNC': { const x = num(ev(0)); if (isErr(x)) return x; const d = args.length > 1 ? num(ev(1)) : 0; if (isErr(d)) return d; return xtrunc(x, d); }
      case 'SUM': { let s = 0; for (let i = 0; i < args.length; i++) { const v = ev(i); if (v && v.__range) { for (const cell of rangeVals(v)) { if (isErr(cell)) return cell; const nn = num(cell); if (!isErr(nn)) s += nn; } } else { if (isErr(v)) return v; const nn = num(v); if (!isErr(nn)) s += nn; } } return s; }
      case 'SUBTOTAL': { const fn = num(ev(0)); const rg = ev(1); const vals = rg && rg.__range ? rangeVals(rg) : [rg]; let s = 0; for (const cell of vals) { if (isErr(cell)) return cell; const nn = num(cell); if (!isErr(nn)) s += nn; } return s; } // 9/109 = SUMA
      case 'VLOOKUP': return fnVlookup(ev(0), ev(1), num(ev(2)), args.length > 3 ? bool(ev(3)) : true);
      case 'INDEX': { const rg = ev(0); if (!rg || !rg.__range) return ERR('#REF!'); const rr = num(ev(1)); const cc = args.length > 2 ? num(ev(2)) : 1; if (isErr(rr)) return rr; if (isErr(cc)) return cc; const r = rg.r1 + (rr - 1), c = rg.c1 + (cc - 1); if (r < rg.r1 || r > rg.r2 || c < rg.c1 || c > rg.c2) return ERR('#REF!'); return getVal(rg.sheet, r, c); }
      case 'IRR': { const rg = ev(0); if (!rg || !rg.__range) return ERR('#NUM!'); const vals = rangeVals(rg).map(v => { const n = num(v); return isErr(n) ? 0 : n; }); const guess = args.length > 1 ? num(ev(1)) : 0.1; return irr(vals, guess); }
      case 'DATE': { const y = num(ev(0)), m = num(ev(1)), d = num(ev(2)); if (isErr(y)) return y; if (isErr(m)) return m; if (isErr(d)) return d; return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000); }
      case 'YEAR': { const s = num(ev(0)); if (isErr(s)) return s; const dt = new Date(EPOCH + Math.round(s) * 86400000); return dt.getUTCFullYear(); }
      case 'MONTH': { const s = num(ev(0)); if (isErr(s)) return s; return new Date(EPOCH + Math.round(s) * 86400000).getUTCMonth() + 1; }
      case 'DAY': { const s = num(ev(0)); if (isErr(s)) return s; return new Date(EPOCH + Math.round(s) * 86400000).getUTCDate(); }
      case 'MATCH': return fnMatch(ev(0), ev(1), args.length > 2 ? num(ev(2)) : 1);
      case 'ABS': { const x = num(ev(0)); return isErr(x) ? x : Math.abs(x); }
      case 'MIN': case 'MAX': { let acc = null; for (let i = 0; i < args.length; i++) { const v = ev(i); const list = v && v.__range ? rangeVals(v) : [v]; for (const cell of list) { const nn = num(cell); if (isErr(nn)) return nn; acc = acc === null ? nn : (name === 'MIN' ? Math.min(acc, nn) : Math.max(acc, nn)); } } return acc === null ? 0 : acc; }
      case 'IFERROR': { const v = ev(0); return isErr(v) ? ev(1) : v; }
    }
    return ERR('#NAME?');
  }

  function fnVlookup(key, rg, colIdx, approx) {
    if (isErr(key)) return key; if (isErr(colIdx)) return colIdx;
    if (!rg || !rg.__range) return ERR('#N/A');
    const kNum = typeof key === 'number'; const kStr = typeof key === 'string' ? key.toUpperCase() : null;
    for (let r = rg.r1; r <= rg.r2; r++) {
      let cell = getVal(rg.sheet, r, rg.c1);
      let match = false;
      if (kNum && typeof cell === 'number') match = cell === key;
      else if (!kNum && typeof cell === 'string') match = cell.toUpperCase() === kStr;
      else match = cell === key;
      if (match) { const c = rg.c1 + (colIdx - 1); if (c > rg.c2) return ERR('#REF!'); return getVal(rg.sheet, r, c); }
    }
    return ERR('#N/A');
  }
  function fnMatch(key, rg, type) {
    if (!rg || !rg.__range) return ERR('#N/A');
    const vals = rangeVals(rg);
    for (let i = 0; i < vals.length; i++) { let a = vals[i], b = key; if (typeof a === 'string' && typeof b === 'string') { a = a.toUpperCase(); b = b.toUpperCase(); } if (a === b) return i + 1; }
    return ERR('#N/A');
  }
  function irr(vals, guess) {
    const npv = rate => { let s = 0; for (let i = 0; i < vals.length; i++) s += vals[i] / Math.pow(1 + rate, i); return s; };
    let lo = -0.9999, hi = 10, flo = npv(lo), fhi = npv(hi);
    // Newton primero
    let r = isFinite(guess) ? guess : 0.1;
    for (let it = 0; it < 60; it++) { const f = npv(r); const df = (npv(r + 1e-6) - f) / 1e-6; if (Math.abs(df) < 1e-12) break; const nr = r - f / df; if (!isFinite(nr)) break; if (Math.abs(nr - r) < 1e-9) { r = nr; break; } r = nr; }
    if (isFinite(r) && Math.abs(npv(r)) < 1e-6 && r > -1) return r;
    // bisección de respaldo
    if (flo * fhi > 0) return ERR('#NUM!');
    for (let it = 0; it < 200; it++) { const mid = (lo + hi) / 2; const fm = npv(mid); if (Math.abs(fm) < 1e-9) return mid; if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
    return (lo + hi) / 2;
  }

  // ---------- API compatible con HyperFormula ----------
  function invalidate() { cache = {}; }
  return {
    getSheetNames: () => nameOf.slice(),
    getSheetId: (name) => idOf[name],
    getCellValue: ({ sheet, col, row }) => { const v = getVal(nameOf[sheet], row, col); return v === undefined ? null : v; },
    setCellContents: ({ sheet, col, row }, content) => { const val = Array.isArray(content) ? content[0][0] : content; grid[nameOf[sheet]][row][col] = val; invalidate(); },
    getCellSerialized: ({ sheet, col, row }) => { const v = raw(nameOf[sheet], row, col); return v === undefined ? null : v; },
    addRows: (sheetId, [index, count]) => { const g = grid[nameOf[sheetId]]; const cols = g[0] ? g[0].length : 0; const blanks = Array.from({ length: count }, () => Array(cols).fill(null)); g.splice(index, 0, ...blanks); invalidate(); },
  };
}

export const HyperFormula = { buildFromSheets: (sheets) => createEngine(sheets) };
export { createEngine, tokenize, parse };
