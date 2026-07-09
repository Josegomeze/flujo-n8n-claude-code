# Cambios v85 → v87 — guía de implementación (Ruby + PostgreSQL)

**Versión del documento: v87 · 09/07/2026** — complemento del `README_DEV.md`
(guía general). Este documento cubre SOLO el delta entre la v85 (calibración
cerrada contra el portal) y la v87 vigente, con el SQL y el Ruby concretos.

**Resumen del delta:**

| Versión | Cambio | ¿Afecta cálculo? | ¿Afecta BD? |
|---|---|---|---|
| v86 | **Switch por clave de la base de la comisión al promotor** | Sí (solo si el switch se activa) | Sí (1 columna nueva) |
| v87 | **Catálogo canónico de claves** (nombres/orden unificados; Pago Automático subdividido en Contraloría/CSS) | No | Sí (catálogo + renombres) |
| v87 | Selector de clave en el apartado de matrices; resaltados | No (solo UI) | No |

Con los switches en su valor por defecto, la v87 calcula **idéntico a la v85
calibrada** (verificado: 25/25 cotizaciones del portal, 316/316 rubros).

---

## 1. PostgreSQL — migración

### 1.1 Catálogo canónico de claves (v87)

El selector de cotización tiene 5 claves (`G8..G12`), pero Pago Automático
(`G11`) se subdivide por entidad, así que la unidad operativa son **6 claves**.
Este catálogo es la única fuente de nombres y orden:

```sql
CREATE TABLE claves (
  id              integer PRIMARY KEY,     -- 1..6 = orden canónico de despliegue
  selector        text    NOT NULL,        -- clave del selector: G8..G12
  entidad         text,                    -- solo Pago Automático: 'Contraloría' | 'Caja de Seguro Social'
  nombre          text    NOT NULL UNIQUE, -- nombre canónico (el que se muestra)
  grupo_matrices  text    NOT NULL CHECK (grupo_matrices IN ('base','variante'))
);

INSERT INTO claves (id, selector, entidad, nombre, grupo_matrices) VALUES
 (1, 'G8',  NULL,                    'Empresa Privada',               'base'),
 (2, 'G9',  NULL,                    'Jubilado y Pensionado',         'base'),
 (3, 'G10', NULL,                    'Gobierno (Descuento Directo)',  'base'),
 (4, 'G11', 'Contraloría',           'Pago Automático — Contraloría', 'variante'),
 (5, 'G11', 'Caja de Seguro Social', 'Pago Automático — CSS',         'variante'),
 (6, 'G12', NULL,                    'Descuento Voluntario',          'variante');
```

Si en la v85 guardaste las tablas por clave con los nombres cortos, renómbralos
(o mejor: cambia la columna de texto por `clave_id` FK a `claves`):

```sql
-- mapeo de nombres v85 -> canónicos v87
UPDATE parametros_clave SET clave = c.nombre
FROM (VALUES
  ('Contraloría',     'Pago Automático — Contraloría'),
  ('CSS',             'Pago Automático — CSS'),
  ('Gobierno',        'Gobierno (Descuento Directo)'),
  ('Empresa Privada', 'Empresa Privada'),
  ('Jubilado',        'Jubilado y Pensionado'),
  ('Voluntario',      'Descuento Voluntario')
) AS c(viejo, nombre)
WHERE parametros_clave.clave = c.viejo;
-- repetir para comision_meses_max y cualquier otra tabla por clave
```

Las matrices tarifarias NO son por clave sino por **grupo** (`base` /
`variante`); las claves las referencian vía `claves.grupo_matrices`. Editar una
matriz afecta a todas las claves de su grupo (así funciona el portal).

### 1.2 Switch de base de la comisión (v86)

```sql
ALTER TABLE parametros_clave
  ADD COLUMN base_comision_promotor text NOT NULL DEFAULT 'total_a_pagar'
  CHECK (base_comision_promotor IN ('total_a_pagar','monto_a_financiar'));
```

En la cotización guardada conviene **congelar** lo aplicado (auditoría):

```sql
ALTER TABLE cotizaciones
  ADD COLUMN base_comision_aplicada text,      -- snapshot al cotizar
  ADD COLUMN meses_comision_aplicados integer; -- min(plazo, tope) usado
```

Migración Rails equivalente:

```ruby
class DeltaV85aV87 < ActiveRecord::Migration[7.1]
  def change
    create_table :claves, id: false do |t|
      t.integer :id, primary_key: true
      t.text :selector, null: false
      t.text :entidad
      t.text :nombre, null: false, index: { unique: true }
      t.text :grupo_matrices, null: false
    end
    add_check_constraint :claves, "grupo_matrices IN ('base','variante')"

    add_column :parametros_clave, :base_comision_promotor, :text,
               null: false, default: 'total_a_pagar'
    add_check_constraint :parametros_clave,
      "base_comision_promotor IN ('total_a_pagar','monto_a_financiar')"
  end
end
```

Los valores semilla completos están en `Parametros_v87.json`
(`catalogos.claves_operativas`, `parametros_por_clave`,
`comision_promotor_meses_maximos`).

---

## 2. Ruby — el cambio de cálculo (regla 8)

### 2.0 Prerrequisito: aritmética idéntica al motor

Usa **`Float`** (double IEEE-754, el mismo tipo que usa el motor JavaScript),
**no `BigDecimal`** — el paquete dorado se generó con doubles y la paridad al
centavo depende de reproducir la misma aritmética. Los redondeos estilo Excel
(con corrección a 15 dígitos significativos) en Ruby:

```ruby
module Redondeo
  module_function

  def sig15(x) = Float(format('%.15g', x))          # 15 dígitos significativos (como Excel)

  def xround(x, d)                                   # ROUND: mitad hacia afuera
    f = 10.0**d
    (x.negative? ? -1 : 1) * ((x.abs * f + 0.5).floor / f)
  end

  def xdown(x, d)                                    # ROUNDDOWN / TRUNC (hacia cero)
    f = 10.0**d
    (x.negative? ? -1 : 1) * (sig15(x.abs * f).floor / f)
  end

  def xup(x, d)                                      # ROUNDUP (alejándose de cero)
    f = 10.0**d
    (x.negative? ? -1 : 1) * (sig15(x.abs * f).ceil / f)
  end
end
```

> Sin `sig15`, `xdown(19.65, 2)` da 19.64 (19.65×100 = 1964.999… en binario) y
> fallan letras por ±$0.01. Esta corrección **ya estaba en la v85**; se lista
> aquí porque es requisito para reproducir los ejemplos de abajo.

### 2.1 La comisión con las dos bases

Nomenclatura (celdas del motor): `G21` = obligación neta (monto a financiar,
la misma base de los intereses) · `H33` = total bruto (gross-up) · `Y19`/`H26`
= % de comisión efectivo · `Y20` = % servicio · `Y25` = % timbres.

```ruby
# % efectivo: el techo de meses (tabla clave × tipo) aplica con AMBAS bases
factor       = [plazo_meses, meses_tope].min / plazo_meses.to_f
pct_efectivo = pct_matriz * factor            # 0 si «Sin Promotor»
referido     = promotor_referido? ? 100.0 : 0.0

case clave.base_comision_promotor
when 'total_a_pagar'                          # método original (v85)
  # la comisión participa del gross-up:
  pct_sobre_total = pct_efectivo + pct_servicio + pct_timbres
  total_bruto = (neta + interes + manejo + NOTARIA_BASE + feci + referido) /
                (1 - pct_sobre_total)
  comision = Redondeo.xround(total_bruto * pct_efectivo, 2) + referido

when 'monto_a_financiar'                      # método nuevo (v86)
  # la comisión sale del gross-up y entra al total como sumando:
  comision = Redondeo.xround(neta * pct_efectivo, 2) + referido
  pct_sobre_total = pct_servicio + pct_timbres
  total_bruto = (neta + interes + manejo + comision + NOTARIA_BASE + feci + referido) /
                (1 - pct_sobre_total)
end

servicio = Redondeo.xround(total_bruto * pct_servicio, 2)
timbres  = Redondeo.xup(total_bruto * pct_timbres, 1)
# ... notaría = residual de reconciliación, igual que en v85 (regla 11)
```

### 2.2 Modo «por letra» (gross-up inverso)

Si implementaste el despeje de la v85 (obtener el monto financiable desde la
letra deseada), con base neta la comisión se mueve del factor `(1 − %)` del
numerador al denominador — igual que el manejo:

```ruby
# letra deseada -> monto financiable (M10 del motor)
pct_num = (base_neta? ? 0 : pct_efectivo) + pct_servicio + pct_timbres
pct_den = base_neta? ? pct_efectivo : 0
a  = (letra * plazo_meses * 2) * (1 - pct_num) - NOTARIA_BASE - referido
b  = 1 + tasa_interes_total + pct_manejo + pct_den            # sin FECI
b2 = b + pct_feci_prorrateado                                 # con FECI (si neta > 5000)
monto_financiable = (a / b) > 5000 ? (a / b2) : (a / b)
```

### 2.3 Efecto de negocio (para validar con el área comercial)

- Con base «monto a financiar» la comisión es menor (la neta es menor que el
  total), el préstamo se abarata y, a igual letra, el cliente recibe más.
- El prorrateo por meses **no cambia**: mismo `min(plazo, tope)/plazo`.
- «Referido» ($100 fijos) y «Sin Promotor» (0) funcionan igual con ambas bases.

---

## 3. Casos de prueba del switch (verificados contra el motor v87)

Cliente de prueba estándar del paquete dorado. Clave **Gobierno (Descuento
Directo)**, tipo **3 · Premium**, promotor **Completo (5%)**, sin
refinanciamiento ni terceros.

**Caso A — por monto: $3,000 a 48 meses** (tope de meses 144 → factor 1):

| Rubro | base total_a_pagar | base monto_a_financiar |
|---|---|---|
| Obligación neta | 3,053.44 | 3,053.44 |
| Comisión promotor | **385.12** | **152.67** (= 5% × 3,053.44) |
| Servicio de descuento | 231.07 | 223.87 |
| Total a pagar | 7,702.08 | 7,462.08 |
| Letra quincenal | 80.23 | 77.73 |
| Recibido en mano | 3,000.00 (exacto) | 3,000.00 (exacto) |

**Caso B — por letra: $45.00 a 48 meses** (mismo escenario):

| Rubro | total_a_pagar | monto_a_financiar |
|---|---|---|
| Total a pagar | 4,320.00 (= 45×96 exacto) | 4,320.00 (= 45×96 exacto) |
| Comisión promotor | 216.00 | 88.16 |
| Recibido en mano | 1,677.94 | **1,732.31** (recibe más) |

**Caso C — tope de meses con base neta**: mismo escenario a 96 meses
solicitados con tope de comisión 60. El plazo primero se topa a **84** (tope
del tipo Premium), luego el factor es 60/84: % efectivo = 5% × 60/84 =
**3.5714%** → comisión = **109.05**.

En los tres casos debe cumplirse: `total = letra × plazo_meses × 2` EXACTO
(la notaría absorbe el residuo) y en modo por monto `recibido = monto` exacto.

**Además:** con todos los switches en `total_a_pagar`, tu implementación debe
seguir pasando **sin cambios** el paquete dorado (1,095 casos) y las 25
cotizaciones vigentes — el delta v85→v87 no altera el método original.

---

## 4. Checklist de implementación

1. [ ] Migración SQL §1.1 (catálogo `claves` + renombres canónicos).
2. [ ] Migración SQL §1.2 (columna `base_comision_promotor`, default `total_a_pagar`).
3. [ ] Regla 8 con las dos bases (§2.1) y el despeje por letra (§2.2).
4. [ ] Snapshot en la cotización guardada (`base_comision_aplicada`).
5. [ ] Pantallas de parámetros: usar SIEMPRE `claves.nombre` y el orden `claves.id`;
       el switch se edita por clave (como la sección 5c del HTML).
6. [ ] Tests: paquete dorado 1,095/1,095 + vigentes 25/25 (switches off) +
       los 3 casos del §3 (switch on).
