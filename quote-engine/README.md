# Motor de cotización — Prueba de concepto (migración hoja de cálculo → TypeScript)

Objetivo: demostrar que el "motor" del Cotizador Fiflouu (hoy una hoja de Excel
incrustada que corre en el navegador con **HyperFormula**, licencia GPL v3) puede
migrarse a **código TypeScript tipado y probado**, sin cambiar los resultados.

La clave para migrar sin riesgo: la hoja actual sirve de **oráculo**. Se generan
miles de casos `entradas → salidas` desde la hoja real y se verifica que el motor
nuevo dé **exactamente lo mismo, al centavo**.

## Resultado de esta PoC

```
Casos: 1050 | OK: 1050 | con alguna diferencia: 0
✅ PARIDAD TOTAL: el motor TS coincide con la hoja en los 1050 casos (al centavo).
```

Todos los renglones (suma a recibir, ITBMS, intereses, comisiones, timbres,
notaría, FECI), el monto neto, el total a pagar y la letra quincenal coinciden
de forma exacta. Los intermedios internos (H33) coinciden con ruido de punto
flotante < 1e-6, muy por debajo de un centavo.

## Alcance cubierto por la PoC

Camino de cotización **por monto** (el ejecutivo indica el monto):

- 7 tipos de cliente × 5 promotores × 6 montos × 5 plazos = **1050 combinaciones**.
- Clave **Empresa Privada**, ITBMS **dentro** de interés/comisión, interés **plano**.
- Resolución de tarifas por **tipo × promotor** (matrices), incluidas las reglas
  especiales del tipo 7 y del promotor "Referido $100" (`AB19`).
- Tope de plazo por tipo de cliente (y regla de monto > 4000).

### Aún no cubierto (siguientes fases, mismo método de paridad)

- Cotización **por letra** (gross-up `M7`), topes de **Pago Automático**.
- **Jubilación** (tope de plazo por edad), **refinanciamiento** por capacidad.
- Variante **Descuento Voluntario** (`G12`), interés **compuesto** (`AF10=1`),
  ITBMS **fuera** (`AF1=1`).
- Otras claves de descuento (Gobierno, Jubilado, CSS…).

## Archivos

| Archivo | Qué hace |
|---------|----------|
| `engine.ts` | Motor de cálculo en TypeScript (camino por monto). Reemplaza las fórmulas. |
| `oracle.mjs` | Genera `oracle.json` manejando la hoja real (HyperFormula headless). |
| `oracle.json` | 1050 casos `entradas → salidas` + la configuración de la financiera. |
| `parity.mjs` | Corre cada caso por el motor TS y compara contra la hoja, campo por campo. |

## Cómo ejecutarlo

Requiere Node 22 (soporta TypeScript por *type-stripping*).

```bash
# (Opcional) Regenerar el oráculo desde la hoja — requiere Chromium headless:
node oracle.mjs

# Verificar la paridad del motor TS contra el oráculo:
node --experimental-strip-types parity.mjs
```

## Por qué esto de-riesga la migración completa

Cada fase futura (letra, pago automático, jubilación, API, base de datos, nodo
n8n) se construye igual: se amplía el oráculo con esos escenarios y no se da por
buena ninguna parte hasta que el motor coincide con la hoja al centavo. Así la
migración es **incremental y verificable**, sin sorpresas para las cotizaciones
reales.
