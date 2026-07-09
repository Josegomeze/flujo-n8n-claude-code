# Cotizador Fiflouu — README para el desarrollador

**Versión del documento: v87 · 09/07/2026** — este README se versiona junto con
el cotizador: cada cambio de versión del HTML actualiza este documento y el
paquete de parámetros (`Parametros_v87.json` / `.xlsx`). El historial de
versiones está al final.

Guía para implementar el cotizador como sistema con **Backend + tablas + Base de
datos**, partiendo de lo que ya está construido y validado en este repositorio.

**Estado actual:** la versión vigente es `Cotizador_Fiflouu__web__v87.html` — un
solo archivo HTML autocontenido (sin dependencias externas, sin GPL) cuyo motor
de cálculo es JavaScript puro. Está **calibrado contra el portal de producción**
(`zonasegura.financieralaprosperidad.app`): reproduce las 25 cotizaciones
vigentes del portal con 316/316 rubros dentro de tolerancia (±$0.10 por rubro;
Notaría ±$2.00). El v86 añadió el **switch por clave de la base de
la comisión al promotor** (ver §3) y el v87 **concilió el catálogo de claves**
(nombres y orden canónicos en todo el sistema) y agregó un selector de clave en
el apartado de matrices; con los switches en el método original (default) los
resultados son idénticos al v85 calibrado.

---

## 1. Mapa del repositorio

| Ruta | Qué es |
|---|---|
| `Cotizador_Fiflouu__web__v87.html` | **Versión vigente.** UI completa + motor por código + datos incrustados. |
| `Cotizador_Fiflouu__web__v76..v86.html` | Versiones anteriores (v85 = calibración contra el portal; v76 es la última con motor de hoja de cálculo). |
| `Parametros_v87.json` | **Todos los parámetros del negocio en JSON** (catálogos, matrices, topes, switch de base de comisión, reglas). Es la semilla de las tablas de la BD. |
| `Parametros_v87_programador.xlsx` | Lo mismo, en Excel legible (8 hojas). |
| `Comparativo_v85_vs_portal.xlsx` | Evidencia de la validación contra el portal (25 cotizaciones, rubro por rubro). |
| `quote-engine/model.js` | **El motor de cálculo** (JavaScript puro, sin dependencias). Es el mismo código que corre dentro del v87. |
| `quote-engine/build_v87.mjs` | Script que construye la versión vigente desde el v76 (inyecta motor, matrices del portal, switch de base, catálogo canónico). Los `build_v85/v86.mjs` construyen las versiones anteriores. |
| `quote-engine/golden/casos_dorados.{csv,json}` | **1,095 casos de prueba** entrada→salida generados desde el v85. Contrato de paridad para cualquier reimplementación. |
| `quote-engine/vigentes/vigentes.json` | Las 25 cotizaciones reales del portal (extracción única, solo lectura). |
| `quote-engine/vigentes/verify_vigentes.mjs` | Verificador: corre el HTML headless y compara contra `vigentes.json`. |
| `quote-engine/engine.ts` | Reimplementación anterior del motor en TypeScript tipado (útil como referencia de lectura; el motor vigente es `model.js`). |
| `INSTRUCCIONES_COWORK_COMPARACION.md` | Cómo se hizo la extracción del portal y resultado de la calibración. |

---

## 2. Conceptos del negocio (no negociables)

1. **El código de tipo de cliente (1-7) es la identidad.** Los nombres son
   etiquetas visuales renombrables por cada financiera. Nunca uses el nombre
   como llave; siempre el código:
   `1=Diamante, 2=Platinum, 3=Premium, 4=24-59 meses, 5=0-23 meses, 6=Recien Nombrado, 7=Eventual`.
2. **Claves de descuento — catálogo CANÓNICO (v87).** El selector de cotización
   tiene 5 claves (`G8..G12`); Pago Automático (`G11`) se subdivide por entidad,
   así que las tablas por clave manejan **6 claves operativas**, siempre con
   estos nombres y este orden:

   | # | Clave operativa | Selector | Grupo de matrices |
   |---|---|---|---|
   | 1 | Empresa Privada | G8 | base |
   | 2 | Jubilado y Pensionado | G9 | base |
   | 3 | Gobierno (Descuento Directo) | G10 | base |
   | 4 | Pago Automático — Contraloría | G11 + entidad | variante |
   | 5 | Pago Automático — CSS | G11 + entidad | variante |
   | 6 | Descuento Voluntario | G12 | variante |

   Las claves del grupo *base* comparten unas matrices (comisión/interés/gasto)
   y las del grupo *variante* comparten las otras — igual que el portal. En la
   BD: tabla `claves` con `grupo_matrices`; las tablas por clave (umbral, meses
   de comisión, servicio, base de comisión) referencian las 6 claves operativas.
3. **Configuración vigente:** ITBMS **financiado** (forma parte de la obligación)
   e interés **agregado** (simple, sin amortización).
4. **Tope CSS = 48 meses** es regla de negocio propia de la financiera (el portal
   usa 72 para todo Débito; esa diferencia es intencional).
5. **Niveles de promotor** (columnas de las matrices): Completo, Media, Baja,
   Sin Comision, Referido (el Referido cobra $100 fijos, no porcentaje).

## 3. Las reglas de cálculo

Las 15 reglas del motor, en orden, están en `Parametros_v87.json` →
`reglas_calculo` (y en la hoja «Reglas de cálculo» del Excel). Resumen de las
que más se prestan a error:

- **Meses de financiamiento** = meses de pago + diciembres saltados (ningún
  producto paga diciembre) + meses completos de gracia entre la fecha de
  cotización y el primer pago (mismo mes = 0).
- **Total bruto** con *gross-up*: los rubros porcentuales (comisión promotor,
  servicio 3%, timbres) se cobran sobre el total, así que
  `H33 = (neta + interés + manejo + notaría_base + FECI + referido) / (1 − suma_de_%)`.
- **Comisión promotor**: el % de la matriz se prorratea por
  `min(plazo_meses, meses_max_tabla) / plazo_meses` (tabla clave × tipo;
  144 en general, Voluntario 60, Empresa Privada × Platinum 60).
- **Base de la comisión promotor — switch por clave** (`Calculadora!AL2:AL7`,
  editable en el panel financiera, sección 5c): `0` = % sobre el **total a
  pagar** (gross-up; método original y default), `1` = % sobre el **monto a
  financiar** (la obligación neta, la misma base de los intereses; la comisión
  sale del gross-up y entra al total como sumando). El prorrateo por meses
  aplica con ambas bases. En la BD debe ser una columna de `parametros_clave`.
- **Notaría = residual de reconciliación** alrededor de la base de $25: la letra
  se redondea al centavo y la notaría absorbe el residuo para que
  `total = letra × quincenas` sea EXACTO. En modo por monto, el recibido en mano
  queda igual al monto solicitado exacto.
- **Redondeos estilo Excel**: mitad hacia afuera; TRUNC/ROUNDDOWN/ROUNDUP operan
  sobre **15 dígitos significativos**. Esto importa: sin esa regla,
  `TRUNC(19.65, 2)` da 19.64 en cualquier lenguaje con float binario (19.65 se
  almacena como 19.649999…). Ver `xround/xdown/xup` al inicio de `model.js`.
  **Si reimplementas en otro lenguaje, replica estas tres funciones tal cual.**

## 4. El motor (`quote-engine/model.js`)

- JavaScript puro, sin dependencias; corre en navegador y en Node sin cambios.
- Es un modelo de **evaluación por demanda con memoización**: cada valor
  (`C24` letra, `G33` total, `F23` interés, …) es una función que se calcula al
  pedirla y se cachea hasta el próximo cambio de entrada.
- Direcciona los valores con nombres heredados de la hoja original (celdas).
  El mapeo celda → concepto está en `Parametros_v87.json`; las entradas/salidas
  principales:

**Entradas** (via `setRaw('Calculadora', celda, valor)`):

| Celda | Concepto |
|---|---|
| `G8..G12` | Clave/producto activo (1 la elegida, 0 el resto) |
| `B11` | Categoría del patrono para Débito: `'Caja de Seguro Social'` o `'Contraloria'` |
| `I1` | Nivel promotor: `'Completo' \| 'Media' \| 'Baja' \| 'Sin Comision' \| 'Referido $100'` |
| `I2` | Tipo de cliente: `'Tipo Cliente 1'..'Tipo Cliente 7'` (llave de identidad) |
| `D2` / `D8` | Monto solicitado (modo por monto) / letra deseada (modo por letra) |
| `F14` | Plazo en meses de pago (2 quincenas por mes) |
| `F17`, `F18` | Refinanciamiento, cancelación a terceros |
| `Motor!J12` | Fecha del primer pago (serial Excel) |
| `J6` | `'SI'/'NO'`: topar el plazo por edad de jubilación |
| `F2..F6, I3, I4` | Datos del cliente: salario, descuentos, embargos, descontable, fecha nac., género |

**Salidas** (via `getV('Calculadora', celda)`):

| Celda | Rubro |
|---|---|
| `C24` | **Letra quincenal** |
| `G33` | **Total a pagar** |
| `F16` | Recibido en mano |
| `F20` | ITBMS |
| `F23` | Intereses |
| `F25` | Comisión de manejo |
| `F26` | Comisión promotor |
| `F27` | Servicio de descuento |
| `F28` | Timbres |
| `F30` | Notaría |
| `F31` | FECI |
| `G21` | Obligación neta |
| `H14` | Meses de financiamiento |

La opción más segura para el backend es **usar `model.js` tal cual** en Node
(el golden pack garantiza paridad) y solo sustituir la fuente de parámetros:
en vez del bloque `RAW` incrustado, hidratar las mismas celdas desde la BD.

## 5. Arquitectura objetivo sugerida

```
[ HTML actual como frontend ]  →  [ API Node ]  →  [ PostgreSQL ]
        (o un frontend nuevo)        motor model.js      parámetros + clientes
                                     auth + roles        + cotizaciones + auditoría
```

**Tablas sugeridas** (las de configuración salen 1:1 de `Parametros_v85.json`):

| Tabla | Contenido / origen en el JSON |
|---|---|
| `financieras` | tenants (si es multi-financiera) |
| `usuarios` | login, rol (`super_admin`, `financiera_admin`, `ejecutivo`) |
| `tipos_cliente` | `(financiera_id, codigo 1-7, nombre)` — solo nombres; el código es global ← `catalogos.tipos_cliente` |
| `productos` | claves y grupo de matrices (base/variante) ← `catalogos.productos_claves` |
| `matrices_tarifas` | `(financiera_id, grupo, concepto, tipo_codigo, nivel_promotor, valor)` ← `matrices_tarifarias` |
| `comision_meses_max` | `(financiera_id, clave, tipo_codigo, meses)` ← `comision_promotor_meses_maximos` |
| `parametros_clave` | capacidad, plazo máx, servicio y base de comisión por clave ← `parametros_por_clave` |
| `topes_tipo` | plazo máximo por tipo ← `topes_plazo_por_tipo_meses` |
| `parametros_globales` | ITBMS, FECI, timbres, notaría base, letra mínima, edades, tope CSS ← `parametros_globales` |
| `clientes` | cédula → salario, descuentos, embargos, descontable, nacimiento, género (hoy: pestaña DATOS del HTML) |
| `promotores` | nombre + nivel |
| `cotizaciones` | entradas + todos los rubros calculados + estado + usuario + fecha |
| `auditoria_parametros` | quién cambió qué parámetro, valor anterior/nuevo, cuándo |

**Endpoints mínimos:**

- `POST /api/login`
- `POST /api/cotizaciones/calcular` — calcula sin guardar (cuerpo = entradas de la tabla §4)
- `POST /api/cotizaciones` — calcula y persiste
- `GET /api/cotizaciones?estado=…`
- `GET /api/clientes/:cedula`
- `GET/PUT /api/parametros/*` — solo roles admin; cada PUT escribe auditoría

## 6. Criterios de aceptación (obligatorios)

Cualquier implementación nueva debe pasar, en este orden:

1. **Paridad con el paquete dorado**: los 1,095 casos de
   `quote-engine/golden/casos_dorados.json` deben reproducirse **al centavo**
   (mismas entradas → mismos rubros). Si usas `model.js` tal cual, esto es
   automático; si reimplementas, es tu suite de pruebas principal.
2. **Validación contra el portal**: las 25 cotizaciones de
   `quote-engine/vigentes/vigentes.json` dentro de tolerancia
   (±$0.10 por rubro; Notaría ±$2.00).

Para verificar el HTML actual (necesita un Chromium headless):

```bash
node quote-engine/vigentes/verify_vigentes.mjs Cotizador_Fiflouu__web__v87.html
# salida esperada: cotizaciones OK 25/25 | rubros OK 316/316
```

> El script usa la ruta de Chromium de este entorno; en tu máquina ajusta la
> constante `BIN` o usa Playwright/Puppeteer para abrir el HTML y evaluar las
> mismas celdas.

## 7. Decisiones abiertas (confirmar con el dueño antes de construir)

- Hosting del backend y de la BD.
- Usuarios y roles definitivos.
- ¿Multi-financiera desde el día 1 o una sola?
- Flujo de estados de la cotización guardada (y si convive con el portal actual).
- Origen definitivo del padrón de clientes (hoy incrustado en la pestaña DATOS).

## 8. Qué NO hacer

- No usar los **nombres** de tipos como llave (se renombran por financiera).
- No recalcular con float sin replicar los redondeos de `model.js` (§3).
- No tomar parámetros de versiones < v87 (v85 fue la calibración; v86 añadió el switch de base; v87 concilió el catálogo de claves).
- No escribir en el portal `zonasegura` — es solo referencia de lectura.

## 9. Historial de versiones

| Versión | Fecha | Cambio |
|---|---|---|
| v72-v73 | jun 2026 | Reordenamiento de tipos de cliente al orden actual (1=Diamante … 7=Eventual). |
| v74-v75 | jun 2026 | El código 1-7 pasa a ser la identidad fija; nombres renombrables por cada financiera desde su propio panel. |
| v76 | jun 2026 | Versión de referencia visual (última con motor de hoja de cálculo/HyperFormula GPL). |
| v77-v78 | jun-jul 2026 | Motor propio por código; la hoja «Calculadora» se elimina (0 fórmulas, sin GPL), visual intacto. |
| v79 | jul 2026 | Corrección del corrimiento de matrices tarifarias introducido en el reorden del v73; plazos del sistema web. |
| v80 | jul 2026 | Tope CSS = 48 meses (regla de negocio). |
| v81-v84 | jul 2026 | Calibración iterativa contra el portal: servicio 3%, meses por cronograma real (diciembres + gracia), notaría como residual de reconciliación (ambos modos). |
| v85 | 04/07/2026 | **Calibración cerrada**: matrices literales del portal, tabla de meses de comisión, redondeos a 15 dígitos. 25/25 cotizaciones vigentes, 316/316 rubros (evidencia: `Comparativo_v85_vs_portal.xlsx`). |
| v86 | 09/07/2026 | **Switch por clave de la base de la comisión al promotor** (total a pagar vs. monto a financiar); panel 5c separado por clave; Tablas ref con la base y resaltado amarillo. Default = método original (misma calibración del v85). |
| v87 | 09/07/2026 | **Catálogo canónico de claves** (mismos nombres y orden en selector, panel y tablas; Pago Automático subdividido en Contraloría/CSS en todas las tablas) y **selector de clave en «5 · Matrices tarifarias»** para ver solo las matrices de la clave elegida. Etiquetas de la variante corregidas (también la usa Pago Automático). |
