# Motor de cotización — TypeScript con paridad 1:1 vs la hoja

Reimplementación del "motor" del Cotizador Fiflouu (hoy una hoja de Excel
incrustada que corre en el navegador con **HyperFormula**, licencia GPL v3) en
**código TypeScript tipado y probado**, sin cambiar los resultados.

Método (migración sin riesgo): la hoja actual es el **oráculo**. Se generan miles
de casos `entradas → salidas` desde la hoja real (headless) y se verifica que el
motor nuevo dé **exactamente lo mismo, al centavo**.

## Resultado

```
parity.mjs           : 1372/1372 cotizaciones al centavo
                       (monto 638 · letra 638 · capacidad 96)
verify_tope.mjs      : 34/34   tope de letra por salario (F11)
verify_capacidad.mjs : 864/864 capacidad máxima (J13/J14)
verify_pagoauto.mjs  : 64/64   aplicación del tope de Pago Automático
--------------------------------------------------------------------
TOTAL                : 2334 verificaciones, 0 diferencias
```

Todos los renglones (suma a recibir, ITBMS, intereses, comisiones, timbres,
notaría, FECI), el monto neto, el total a pagar y la letra quincenal coinciden de
forma exacta. Los intermedios internos coinciden con ruido de punto flotante
< 1e-6, muy por debajo de un centavo.

## Alcance cubierto

**Los tres caminos de entrada de la cotización:**
- **Por monto** (`D2`): el ejecutivo indica el monto.
- **Por letra** (`D8`): indica la letra quincenal; se hace *gross-up* `M10 → M7`.
- **Por capacidad** (`N7`): la letra sale de la capacidad máxima del cliente (`J13`).

**Reglas del negocio:**
- Las **5 claves** de descuento: Empresa Privada (`G8`), Jubilado (`G9`),
  Gobierno (`G10`), Pago Automático (`G11`, CSS y Contraloría) y Descuento
  Voluntario (`G12`, con sus matrices de variante).
- Resolución de **tarifas por tipo × promotor** (matrices), incluidas las reglas
  especiales del tipo 7 y del promotor "Referido $100" (`AB19`).
- **Toggles:** ITBMS dentro/fuera (`AF1`) e interés plano/compuesto (`AF10`).
- **Refinanciamiento** y cancelación a terceros.
- **Jubilación:** tope de plazo por meses hasta pensión (edad y género).
- **Pago Automático:** tope de plazo (60 CSS / 72 Contraloría), tope de letra por
  salario (`F11`), capacidad (`J13`) y aplicación de la letra a dólar entero.

### Fuera de alcance (documentado)

- Ruta de **seguro** (`G19="Si"`, filas `M2/M3/O2/O3`) — no habitual.
- Regla de **anulación** de la cotización (cuotas < 1 o letra < 5 → todo en cero):
  es un guardado de presentación en la UI, no del cálculo.

## Contrato del cliente

Los únicos datos crudos del cliente (de `DATOS`) que consume el motor son:
`salario` (F2), `descComercial` (F3), `claveN147` (F4), `embargos` (F5) y
`descontable` (F6). Todo lo demás es lógica derivada, portada y verificada.

## Archivos

| Archivo | Qué hace |
|---------|----------|
| `engine.ts` | Motor de cálculo en TypeScript (monto / letra / capacidad + Pago Automático). |
| `oracle.mjs` | Genera `oracle.json` manejando la hoja real (HyperFormula headless). |
| `oracle.json` | Casos `entradas → salidas` + la configuración de la financiera. |
| `parity.mjs` | Compara el motor contra el oráculo, campo por campo. |
| `verify_tope.mjs` | Verifica el tope `F11` (Pago Automático). |
| `verify_capacidad.mjs` | Verifica la capacidad `J13/J14`. |
| `verify_pagoauto.mjs` | Verifica la aplicación del tope de Pago Automático. |

## Cómo ejecutarlo

Requiere Node 22 (TypeScript por *type-stripping*).

```bash
# (Opcional) Regenerar el oráculo desde la hoja — requiere Chromium headless:
node oracle.mjs

# Verificaciones:
node --experimental-strip-types parity.mjs
node --experimental-strip-types verify_tope.mjs
node --experimental-strip-types verify_capacidad.mjs
node --experimental-strip-types verify_pagoauto.mjs
```

## Siguiente paso

El motor de cálculo está completo y verificado. Lo que sigue es empaquetarlo como
**servicio/API** (Node/TypeScript) con los datos en **base de datos** (en vez de
incrustados) y, si se desea, exponerlo como **nodo n8n** — sin volver a tocar la
lógica de cálculo, ya probada al centavo.
