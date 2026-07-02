# Instrucciones para Cowork — Comparar el sistema web vs el Cotizador HTML v80

**Objetivo:** verificar que el sistema web (`zonasegura.financieralaprosperidad.app`) y el
Cotizador HTML v80 producen **los mismos resultados**, copiando 10 cotizaciones reales
(lo más dispares posible) del sistema web y reproduciéndolas en el v80.

---

## Preparación (antes de pegar el prompt)

1. Adjunta a la sesión de Cowork el archivo **`Cotizador_Fiflouu__web__v80.html`**.
2. Asegúrate de estar **logueado** en `zonasegura.financieralaprosperidad.app` en el
   navegador conectado a Cowork.

---

## PROMPT LISTO PARA PEGAR EN COWORK

```
Vas a comparar dos sistemas de cotización. Sigue estas reglas y pasos AL PIE DE LA LETRA.

REGLAS OBLIGATORIAS (no negociables):
1. En https://zonasegura.financieralaprosperidad.app/ SOLO PUEDES VER. Prohibido:
   crear cotizaciones nuevas, guardar, editar, borrar o enviar cualquier formulario.
   No entres a "nueva cotización" ni hagas clic en botones de acción. Solo navegar
   listas y abrir detalles para leer.
2. TODOS los cálculos se hacen ÚNICAMENTE en el archivo adjunto
   Cotizador_Fiflouu__web__v80.html (ábrelo en el navegador).
3. En el v80 verifica antes de cotizar: el botón de método debe decir
   "Interés: agregado" (NO "sobre saldo") y el toggle de ITBMS fuera debe estar
   DESACTIVADO (el ITBMS se financia dentro). Son los valores por defecto; no los cambies.
4. No modifiques parámetros de la financiera en el v80. Si en el PASO 1 encuentras
   diferencias de parámetros, DETENTE y repórtamelas antes de continuar.

PASO 1 — VERIFICAR QUE AMBOS SISTEMAS USAN LOS MISMOS PARÁMETROS:
a) Abre https://zonasegura.financieralaprosperidad.app/patrono_categories y
   https://zonasegura.financieralaprosperidad.app/tabla_matrices (solo ver).
b) En el v80 abre "⚙ Ver / editar Parámetros financiera" y la pestaña
   "Tablas (ref)" de la sección avanzada.
c) Compara y muestra una tabla de verificación (parámetro | web | v80 | ¿igual?):
   - Matrices tarifarias por tipo de cliente × promotor: comisión, interés y
     gasto de cierre / comisión administrativa (en %).
   - Plazo máximo por tipo de cliente.
   - Umbral / categorías de patrono (porcentaje, meses, meses máx por clave).
   - ITBMS, FECI, timbres, notaría, piso de letra.
   - Topes de Pago Automático por salario (Contraloría y CSS).
d) Si TODO coincide, continúa. Si algo difiere, repórtalo y espera mi confirmación.

PASO 2 — COPIAR 10 COTIZACIONES REALES, LO MÁS DISPARES POSIBLE:
Abre https://zonasegura.financieralaprosperidad.app/quotes (solo ver) y elige 10
cotizaciones que cubran la mayor variedad:
   - Distintas claves/categorías: Empresa Privada, Gobierno, Jubilado,
     Pago Automático Contraloría, Pago Automático CSS, Descuento Voluntario.
   - Distintos tipos de cliente (al menos 4 diferentes).
   - Montos chico (<$1,500), mediano y grande (>$8,000).
   - Plazos corto (≤24) y largo (≥60).
   - Al menos una por MONTO y una por LETRA solicitada.
   - Si existen: una con refinanciamiento y una con cancelación a terceros.
   - Distintos promotores (Completo / Media / Baja / Sin Comisión / Referido $100).
Para CADA cotización copia (léelo del detalle, no calcules nada):
   ENTRADAS: identificador y fecha de la cotización, cédula/cliente, salario y
   descuentos del cliente, institución/patrono, tipo de cliente, promotor,
   monto solicitado O letra solicitada, plazo, refinanciamiento, cancelación a terceros.
   RESULTADOS DEL SISTEMA WEB: cuotas, letra quincenal, suma a recibir,
   monto obligación neta, total a pagar, intereses, comisión administrativa,
   comisión promotor, servicio de descuento, timbres, FECI, ITBMS, notaría.

PASO 3 — REPRODUCIR CADA CASO EN EL v80 (aquí SÍ calculas):
Para cada uno de los 10 casos, en el HTML v80:
   a) Si la cédula existe en el selector, selecciónala. Si no, usa "➕ Agregar
      cliente" con el salario, descuentos, institución y tipo de cliente del caso.
   b) Selecciona la clave de descuento, el promotor y el tipo de cliente del caso.
   c) Ingresa monto O letra (según cómo se hizo en la web), plazo,
      refinanciamiento y cancelación a terceros.
   d) Confirma: "Interés: agregado" e ITBMS financiado (toggle fuera = OFF).
   e) Lee los resultados de la cotización del v80.

PASO 4 — TABLA COMPARATIVA FINAL:
Muestra una tabla con TODOS los casos y conceptos:
   Caso | Concepto | Sistema web | HTML v80 | Diferencia | ✓/✗
Criterios:
   - Tolerancia: ±$0.01 en montos. Cuotas deben ser exactas.
   - NO compares fechas de primer/último pago si la cotización web no es de hoy
     (dependen de la fecha y las planillas); indícalo como "no comparable".
   - Si la cotización web es antigua, advierte que pudo calcularse con parámetros
     anteriores.
Cierra con un resumen: nº de conceptos comparados, coincidencias, diferencias y,
para cada diferencia, tu diagnóstico de la causa probable (parámetro distinto,
redondeo, dato del cliente distinto, fecha).
```

---

## Notas para ti (no van en el prompt)

- **Regla CSS confirmada:** Pago Automático CSS tope de plazo = **48 meses** (decisión
  de negocio). El v80 la aplica en el tope, las cuotas y la tabla de umbral. El sistema
  web usa un bucket "Débito" de 72 sin separar CSS: las cotizaciones CSS del web con
  plazo > 48 diferirán del v80 **a propósito** (el web es el que debería corregirse).

- **Por qué ITBMS financiado + interés agregado:** son los valores por defecto del v80
  (toggle "Interés: agregado" y ITBMS dentro de la base). Coinciden con la configuración
  del sistema web según indicaste.
- **Si el Paso 1 detecta parámetros distintos**, no tiene sentido comparar cotizaciones:
  primero se alinean parámetros (o se anota la diferencia esperada).
- **Casos no comparables por diseño:** fechas de pago (dependen del día y las planillas)
  y la TIR si el sistema web la calcula con otro flujo. La letra, los cargos y los
  totales sí deben coincidir al centavo.
- Complemento opcional: en el repositorio está `quote-engine/golden/casos_dorados.csv`
  (1,095 casos entrada→salida generados del v80 con un cliente de prueba fijo). Sirve
  para probar cualquier sistema en dirección inversa: darle las entradas al otro
  sistema y comparar contra lo esperado.
