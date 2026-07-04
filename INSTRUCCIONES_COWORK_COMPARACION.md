# Instrucciones para Cowork — Extracción única del portal (parámetros + cotizaciones vigentes)

**Nueva estrategia:** en lugar de comparar 10 casos por ronda, Cowork hace UNA
extracción completa: (A) todos los parámetros de la financiera y (B) todas las
cotizaciones vigentes (ya validadas). Con esos dos archivos, los ajustes del
cotizador HTML se hacen localmente, sin volver a consultar el portal.

**Preparación:** estar logueado en `zonasegura.financieralaprosperidad.app` en el
navegador conectado a Cowork. No hace falta adjuntar el HTML (esta corrida es
solo extracción, no comparación).

---

## PROMPT LISTO PARA PEGAR EN COWORK

```
Vas a hacer una EXTRACCIÓN DE DATOS del portal. Reglas obligatorias:

1. En https://zonasegura.financieralaprosperidad.app/ SOLO PUEDES VER. Prohibido
   crear, guardar, editar, borrar o enviar cualquier formulario. Solo navegar y leer.
2. NO calcules, NO interpretes, NO traduzcas nombres: copia los valores y los
   nombres EXACTAMENTE como los muestra el portal (nomenclatura literal de
   productos, categorías, columnas y rubros). Si un campo no está visible,
   déjalo vacío y anótalo en las notas.
3. Números en formato plano: punto decimal, sin separador de miles, sin "$".

ENTREGABLE A — PARAMETROS_PORTAL.md
a) Catálogo de productos/claves: lista EXACTA de los productos que ofrece el
   portal para cotizar (los nombres tal cual aparecen en el selector o listado).
b) https://zonasegura.financieralaprosperidad.app/patrono_categories:
   la tabla COMPLETA, todas las filas y columnas, con los encabezados exactos.
c) https://zonasegura.financieralaprosperidad.app/tabla_matrices:
   TODAS las tablas/productos completos, celda por celda, con encabezados exactos
   de fila y columna (incluye todas las columnas: comision, costo, interés,
   manejo, y cualquier otra). No omitas ningún producto (incluido Pago Voluntario).
d) Lista de cualquier otra pantalla de configuración visible (servicio, notaría,
   timbres, FECI, ITBMS, topes) con sus valores; si no existe, indícalo.

ENTREGABLE B — COTIZACIONES_VIGENTES.csv
De https://zonasegura.financieralaprosperidad.app/quotes recorre el listado
(todas las páginas) y extrae TODAS las cotizaciones VIGENTES (estados que
signifiquen válida/activa; indica qué estados incluiste). Una fila por
cotización, con estas columnas (deja vacío lo que no aplique):

id, fecha, estado, producto (nombre exacto del portal), patrono/institucion,
categoria_patrono, tipo_cliente/tarifa, promotor, salario_cliente,
descuentos_cliente, modo (monto o letra), monto_solicitado, letra_solicitada,
plazo_cuotas, meses_financiamiento, primer_pago, ultimo_pago,
refinanciamiento, cancelacion_terceros, acreedor,
letra_quincenal, total_pagar, intereses, feci, notaria, servicio_descuento,
comision_promotor, comision_admin_manejo, timbres, obligacion_neta, itbms,
recibido_en_mano, tir

Entrega el CSV como archivo descargable (o en bloque de código si es corto).
Al final reporta: nº total de cotizaciones extraídas, estados incluidos, campos
que no estaban disponibles, y cuántas páginas recorriste.

Si el listado es muy grande (>200), extrae completas las 100 más recientes y
lista solo id/fecha/producto/total del resto.
```

---

## Qué hacer con los archivos

Trae `PARAMETROS_PORTAL.md` y `COTIZACIONES_VIGENTES.csv` a la sesión de
ingeniería (esta). Con eso:
1. Se corrige el **mapeo de productos** (el portal no maneja "Empresa Privada";
   el mapeo actual era interpretación de Cowork).
2. Se descifra la regla de **comisión promotor** en Voluntario y Platinum a plazo
   largo ajustando contra TODAS las cotizaciones vigentes (no solo 2 casos).
3. Se valida el cotizador HTML contra el dataset completo, localmente, y las
   próximas versiones se prueban contra ese mismo archivo sin tocar el portal.

## Notas

- **Regla CSS confirmada:** tope de plazo CSS = 48 meses (decisión de negocio).
  El portal usa un bucket "Débito" de 72 sin separar CSS: esas cotizaciones
  diferirán a propósito.
- **ITBMS financiado + interés agregado**: configuración vigente en ambos sistemas.
- Pendiente único de cálculo: comisión promotor en Voluntario y Platinum ≥60
  cuotas (se resuelve con esta extracción).
