# Motor de cotización — Prueba de concepto (migración hoja de cálculo → TypeScript)

Objetivo: demostrar que el "motor" del Cotizador Fiflouu (hoy una hoja de Excel
incrustada que corre en el navegador con **HyperFormula**, licencia GPL v3) puede
migrarse a **código TypeScript tipado y probado**, sin cambiar los resultados.

La clave para migrar sin riesgo: la hoja actual sirve de **oráculo**. Se generan
miles de casos `entradas → salidas` desde la hoja real y se verifica que el motor
nuevo dé **exactamente lo mismo, al centavo**.

## Resultado de esta PoC

```
Casos: 1925 | OK: 1925 | con alguna diferencia: 0
  por monto: OK 1050 / fail 0   |   por letra: OK 875 / fail 0
✅ PARIDAD TOTAL: el motor TS coincide con la hoja en los 1925 casos (al centavo).

Tope Pago Automático (F11): 34 combinaciones | fallos: 0 ✅
```

Todos los renglones (suma a recibir, ITBMS, intereses, comisiones, timbres,
notaría, FECI), el monto neto, el total a pagar y la letra quincenal coinciden
de forma exacta. Los intermedios internos (H33) coinciden con ruido de punto
flotante < 1e-6, muy por debajo de un centavo.

## Alcance cubierto por la PoC

Ambos caminos de entrada de la cotización:

- **Por monto** (el ejecutivo indica el monto): 7 tipos × 5 promotores × 6 montos × 5 plazos = **1050 casos**.
- **Por letra** (el ejecutivo indica la letra quincenal; se hace "gross-up" `M10 → M7`): 7 tipos × 5 promotores × 5 letras × 5 plazos = **875 casos**.
- **Tope de Pago Automático por salario** (`F11`, tablas Contraloría y CSS): **34 casos** verificados aparte (`verify_tope.mjs`).

En todos: clave **Empresa Privada**, ITBMS **dentro**, interés **plano**,
resolución de tarifas por **tipo × promotor** (incluidas las reglas del tipo 7 y
del promotor "Referido $100"), y tope de plazo por tipo de cliente.

### Aún no cubierto (siguientes fases, mismo método de paridad)

- **Aplicación** del tope de Pago Automático (redondeo a dólar entero + tope por
  capacidad `J13`) — ya está la tabla `F11`; falta la capa que la aplica.
- **Jubilación** (tope de plazo por edad), **refinanciamiento** por capacidad.
- Variante **Descuento Voluntario** (`G12`), interés **compuesto** (`AF10=1`),
  ITBMS **fuera** (`AF1=1`).
- Otras claves de descuento (Gobierno, Jubilado, CSS…) en el cuerpo de la cotización.

## Archivos

| Archivo | Qué hace |
|---------|----------|
| `engine.ts` | Motor de cálculo en TypeScript (caminos por monto y por letra + tope Pago Automático). |
| `oracle.mjs` | Genera `oracle.json` manejando la hoja real (HyperFormula headless). |
| `oracle.json` | 1925 casos `entradas → salidas` (monto+letra) + la configuración de la financiera. |
| `parity.mjs` | Corre cada caso por el motor TS y compara contra la hoja, campo por campo. |
| `verify_tope.mjs` | Verifica la tabla de tope `F11` (Pago Automático) contra la hoja. |

## Cómo ejecutarlo

Requiere Node 22 (soporta TypeScript por *type-stripping*).

```bash
# (Opcional) Regenerar el oráculo desde la hoja — requiere Chromium headless:
node oracle.mjs

# Verificar la paridad del motor TS contra el oráculo (monto + letra):
node --experimental-strip-types parity.mjs

# Verificar la tabla de tope de Pago Automático (F11):
node --experimental-strip-types verify_tope.mjs
```

## Por qué esto de-riesga la migración completa

Cada fase futura (letra, pago automático, jubilación, API, base de datos, nodo
n8n) se construye igual: se amplía el oráculo con esos escenarios y no se da por
buena ninguna parte hasta que el motor coincide con la hoja al centavo. Así la
migración es **incremental y verificable**, sin sorpresas para las cotizaciones
reales.
