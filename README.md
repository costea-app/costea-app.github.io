# Costea

**Que ningún costo se quede por fuera.** Costea ayuda a pequeños emprendedores a calcular cuánto les
cuesta producir un producto físico (panes, pasteles, velas, accesorios, artesanías…) y les sugiere un
precio de venta según la ganancia que quieren. Es una SPA en Angular con Supabase (PostgreSQL + Auth)
y un modo demo que funciona sin cuenta.

> Los precios que calcula Costea son **antes de impuestos**. Esta versión no calcula IVA ni otros
> impuestos, y no incluye inventario, facturación, cobros ni múltiples roles.

---

## Índice

1. [Stack y versiones](#stack-y-versiones)
2. [Ejecución con Docker](#ejecución-con-docker)
3. [Pruebas](#pruebas)
4. [Configuración de Supabase](#configuración-de-supabase)
5. [Cómo llega la configuración pública al frontend](#cómo-llega-la-configuración-pública-al-frontend)
6. [Despliegue en GitHub Pages](#despliegue-en-github-pages-gratis)
7. [Arquitectura](#arquitectura)
8. [Fórmulas](#fórmulas)
9. [Modelo de datos y seguridad](#modelo-de-datos-y-seguridad)
10. [Limitaciones y pasos manuales](#limitaciones-y-pasos-manuales)

---

## Stack y versiones

| Pieza | Versión | Notas |
|---|---|---|
| Node.js | 24 (imagen `node:24-alpine`, 24.22.1) | Angular 22 exige `^22.22.3 \|\| ^24.15.0` |
| Angular (core, router, forms) | 22.2.3 | Versión estable actual (22.0.0 salió el 3 de junio de 2026). Standalone, zoneless, lazy loading |
| Angular CLI / `@angular/build` | 22.2.4 | Builder `application` (esbuild) y `unit-test` (Vitest) |
| Angular Material / CDK | 22.2.4 | Tema M3 personalizado en verde |
| TypeScript | 6.0.3 | `strict: true` y `strictTemplates: true` |
| @supabase/supabase-js | 2.118.0 | Se descarga de forma diferida solo si hay configuración |
| decimal.js | 10.6.0 | Todo el cálculo; precisión de 40 dígitos |
| Vitest | 5.0.5 | Pruebas unitarias y de integración |
| PostgreSQL (pruebas) | 17 (`postgres:17-alpine`) | Pruebas de migraciones y RLS |
| PostgREST (pruebas) | v12.2.12 | Pruebas de integración del adaptador de Supabase |
| Playwright (pruebas) | 1.64.1 | Recorrido E2E de humo en navegador headless |

Sin NgRx, sin SSR, sin NestJS y sin servicios de pago obligatorios.

---

## Ejecución con Docker

Todo se ejecuta en contenedores: no hace falta tener Node instalado. `node_modules` vive en un
volumen de Docker (la carpeta `node_modules/` que aparece en el proyecto es solo el punto de montaje vacío).

```bash
# 1. (Opcional) Configuración pública de Supabase. Sin esto solo funciona el modo demo.
cp .env.example .env        # y completa SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY

# 2. Servidor de desarrollo con recarga automática
docker compose up web       # → http://localhost:4200

# 3. Build de producción servido con nginx en la raíz
docker compose --profile prod up --build prod   # → http://localhost:8080

# 4. Vista previa que imita GitHub Pages (ruta /costea/)
docker compose --profile ghpages up --build ghpages   # → http://localhost:8090/costea/
```

Cualquier comando de npm o del CLI de Angular también se ejecuta en el contenedor:

```bash
docker compose run --rm tools npm install <paquete>
docker compose run --rm tools npx ng generate component ...
```

Si cambias `package.json`, reconstruye la imagen y el volumen de dependencias:

```bash
docker compose down -v && docker compose build web
```

---

## Pruebas

| Comando | Qué verifica | Resultado en la última ejecución |
|---|---|---|
| `docker compose run --rm test` | Motor de costeo, formato es-CO, formulario del asistente, adaptador demo (crear, editar, duplicar, persistir, integridad, instantáneas) y datos demo | **52/52** ✔ |
| `docker compose --profile test run --rm rls-test` | Migraciones en Postgres 17 + **46** aserciones: RLS entre dos usuarios, IDs manipulados, restricciones, unidades incompatibles, transaccionalidad de `save_product`, flujos crear/editar/duplicar, instantáneas inmutables, acceso anónimo | **46/46** ✔ |
| `docker compose --profile integration run --rm it-test` | `SupabaseRepository` + supabase-js reales contra PostgREST, con JWT de dos usuarios | **1/1** ✔ (flujo completo) |
| `docker compose up -d web && sh e2e/run.sh` | Recorrido E2E en Chromium headless: landing, demo, duplicar, crear con el asistente, recargar, reporte, instantánea, impacto de precio, eliminar, recarga de ruta interna y vista móvil sin desbordamiento. Falla si hay errores en consola. Guarda capturas en `e2e/screenshots/` | ✔ |

Casos exigidos que cubre `src/app/core/engine/engine.spec.ts`:

- Material de $5.000 por 1.000 g, usando 300 g → **$1.500**.
- Tanda de $24.000 con 12 unidades → **$2.000** por unidad.
- Costo $10.000, margen 30 %, sin comisiones → **$14.285,714286**.
- Costo $10.000, margen 30 %, comisión 5 % → **$15.384,615385** (y el margen efectivo resultante es exactamente 30 %).
- Conversiones kg↔g, L↔ml, m↔cm y unidades; rechazo de g→ml sin un factor explícito.
- Redondeo hacia arriba a $100/$500 con ganancia y margen recalculados.
- Validaciones: divisiones por cero, negativos, porcentajes fuera de rango, margen + comisión ≥ 100 %, costo cero intencional.

**Qué no se pudo probar:** contra un proyecto real de Supabase Cloud (no hay credenciales). Las
pruebas de RLS usan Postgres 17 con un esquema `auth` mínimo que imita a Supabase (`auth.users`,
`auth.uid()` leyendo `request.jwt.claims`, roles `anon` y `authenticated`), y la integración usa
PostgREST, el mismo motor de API de Supabase. Sobre el proyecto real solo se comprobó que existen
las tablas, que el acceso anónimo está bloqueado y la configuración de Auth; el registro y el inicio
de sesión reales se prueban a mano (ver pasos manuales).

---

## Configuración de Supabase

Supabase se usa como **base de datos** y para un **registro simple con correo y contraseña**:
no se envían correos (sin confirmación de cuenta ni recuperación de contraseña).

1. Crea un proyecto en <https://supabase.com> (plan gratuito, sin tarjeta).
2. **SQL Editor → New query**: ejecuta, en orden y cada uno completo, los archivos de `supabase/migrations/`
   (`20261027000001_costea_schema.sql` y luego `20261028000002_production_schedule.sql`).
   (Alternativa: `npx supabase link --project-ref <ref>` y `npx supabase db push`.)
   No ejecutes los archivos de `supabase/tests/`.
3. **Authentication → Sign In / Providers → Email**: deja el proveedor habilitado y **desactiva
   “Confirm email”**. Guarda. Así la cuenta queda lista al registrarse.
4. Copia la **Project URL** y la **Publishable key** (`sb_publishable_…`) desde el botón **Connect**
   o **Project Settings → API Keys**. Nunca uses `service_role` ni `sb_secret_…` en el frontend:
   `scripts/write-config.mjs` las rechaza.

No hace falta configurar Site URL, Redirect URLs, plantillas de correo ni SMTP.

---

## Cómo llega la configuración pública al frontend

Angular **no lee archivos `.env`**. Costea carga la configuración en tiempo de ejecución:

1. `scripts/write-config.mjs` lee las variables de entorno `SUPABASE_URL` y
   `SUPABASE_PUBLISHABLE_KEY` y genera `public/config.js`
   (`window.__COSTEA_CONFIG__ = { supabaseUrl, supabasePublishableKey }`).
2. `src/index.html` carga `config.js` antes de la app; `src/app/core/config/app-config.ts` lo lee.
3. **En local** las variables salen de `.env` (docker compose lo lee). **En GitHub Pages** están en
   `.github/workflows/deploy.yml`: son valores públicos por diseño; la protección de los datos está en RLS.

Si falta la configuración, las pantallas de acceso lo dicen y ofrecen el modo demo **como opción
explícita**; la app nunca cambia a demo por su cuenta si Supabase falla.

---

## Despliegue en GitHub Pages (gratis)

GitHub Pages solo sirve archivos estáticos, que es justo lo que es Costea (la base de datos está en Supabase).

1. Crea un repositorio en GitHub llamado `costea` y sube el proyecto (`git push` a la rama `main`).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Cada `push` a `main` ejecuta `.github/workflows/deploy.yml` en los servidores de GitHub:
   `npm ci` → pruebas → `npm run build:pages` → publicación.
4. La app queda en `https://<tu-usuario>.github.io/costea/` (pestaña **Actions** para ver el progreso).

Detalles:

- **Ruta base:** el workflow compila con `--base-href /<nombre-del-repo>/` (o `/` si el repositorio
  se llama `<usuario>.github.io`).
- **Rutas internas al recargar:** `scripts/prepare-pages.mjs` lee la carpeta real de salida desde
  `angular.json` (`dist/costea/browser`), copia `index.html` como `404.html` y crea `.nojekyll`.
  GitHub Pages responde `404.html` en rutas desconocidas, así que `/costea/app/...` carga la app
  (con código HTTP 404, comportamiento normal de GitHub Pages).
- **Vista previa local idéntica:** `docker compose --profile ghpages up --build ghpages`
  → <http://localhost:8090/costea/>.
- Si cambias de proyecto de Supabase, actualiza los dos valores públicos en `deploy.yml`.

## Arquitectura

```
src/app/
├── core/
│   ├── engine/            Motor de costeo: funciones puras con decimal.js (sin Angular)
│   │   ├── decimal.ts       instancia de decimal.js y validaciones
│   │   ├── units.ts         unidades y conversiones
│   │   ├── costing.ts       materiales, trabajo, compartidos, costo unitario, checklist, estado
│   │   ├── pricing.ts       margen, recargo, comisión, cargo fijo, redondeo, simulador
│   │   └── number-format.ts lectura de números es-CO y formato para mostrar
│   ├── models/            Modelos de dominio y fábricas
│   ├── data/
│   │   ├── repository.ts         contrato de persistencia
│   │   ├── supabase.repository.ts adaptador Supabase (PostgREST + RPC transaccional)
│   │   ├── demo.repository.ts    adaptador demo (localStorage, mismas reglas de integridad)
│   │   ├── demo-seed.ts          datos de ejemplo (solo modo demo)
│   │   └── data.service.ts       elige adaptador según la sesión; duplicar e instantáneas
│   ├── auth/              Sesión (Supabase Auth / modo demo) y guards
│   └── config/            Lectura de la configuración pública
├── shared/                Pipes, validadores, chips, diálogo de confirmación, gráfico y vista de resultados
└── features/              Páginas (cada una con lazy loading)
    ├── landing/  auth/  shell/  businesses/  business/  materials/  wizard/  reports/
```

- Ambos modos usan **el mismo motor** (`computeCosting`), y los costeos nunca se guardan precalculados:
  se recalculan con los datos actuales, así que al cambiar el precio de un material todos los
  costeos actuales se actualizan, mientras que los reportes guardados conservan su instantánea.
- Estado con **signals** y servicios; formularios con **Reactive Forms tipados**.
- Los datos demo nunca se insertan en cuentas reales.

---

## Fórmulas

Todas las cantidades se normalizan a la unidad del material antes de calcular.

| Concepto | Fórmula |
|---|---|
| Costo de material | (precio comprado ÷ cantidad comprada) × cantidad utilizada |
| Trabajo de la tanda | (minutos ÷ 60) × valor por hora |
| Gastos compartidos de la tanda | (gasto mensual ÷ horas productivas mensuales) × horas de producción de la tanda |
| Costo unitario **C** | costos de la tanda ÷ unidades vendibles + costos por unidad |
| Precio con margen objetivo | **P = (C + f) ÷ (1 − m − c)**, con m + c < 1 |
| Precio con recargo | **P = (C + f) × (1 + recargo)** (el recargo se aplica antes de descontar la comisión) |
| Ganancia estimada por unidad | **G = P − C − f − P × c** |
| Margen efectivo | **G ÷ P** |

m = margen objetivo, c = comisión sobre la venta, f = cargo fijo de venta **por unidad** (no por
pedido). La comisión y el cargo fijo no están dentro de C. El redondeo comercial es hacia arriba y
la ganancia y el margen se recalculan con el precio redondeado. La precisión intermedia es completa;
solo se redondea al mostrar (máx. 2 decimales) o al aplicar el precio comercial.

**Pérdidas:** se registran usando los materiales realmente consumidos y las unidades realmente
vendibles; así ya están incluidas y no se suma otro porcentaje de desperdicio.

**Checklist:** cada categoría (materiales, empaque, trabajo, servicios, transporte, pérdidas, gastos
compartidos, comisiones) está *pendiente*, *incluida* o *no aplica*. “Incluida” solo es posible si hay
datos reales en el costeo. Si queda alguna pendiente, el precio se muestra como **provisional** y se
listan las faltantes. Estado del producto: **pendiente** (faltan categorías o hay errores),
**estimado** (completo pero con importes estimados) o **revisado**.

---

## Modelo de datos y seguridad

Tablas: `businesses`, `materials`, `products`, `product_materials`, `product_costs`,
`product_checklist`, `report_snapshots`. Importes y cantidades en `NUMERIC`.

- **RLS** en todas las tablas con `user_id = auth.uid()` en SELECT/INSERT/UPDATE/DELETE
  (`USING` y `WITH CHECK`). `anon` no tiene acceso. Las instantáneas no tienen política de UPDATE: son inmutables.
- **IDs manipulados:** claves foráneas compuestas `(business_id, user_id) → businesses(id, user_id)`,
  `(product_id, business_id) → products` y `(material_id, business_id) → materials`. Una línea no
  puede apuntar a un material de otro negocio ni de otro usuario, aunque se fuercen los IDs.
- **Restricciones:** cantidades compradas y unidades vendibles > 0, montos ≥ 0, porcentajes en
  [0, 1), margen + comisión < 1, unidades válidas, unidades compatibles entre línea y material (trigger),
  material en uso no se puede eliminar ni cambiar a otra dimensión.
- **Transacciones:** `save_product(jsonb)` guarda producto, líneas, costos y checklist en una sola
  función (`SECURITY INVOKER`, así RLS sigue aplicando). Si algo falla no queda ningún estado parcial.
- El frontend solo conoce la URL y la clave publicable; los guards de Angular son comodidad, no seguridad.

---

## Limitaciones y pasos manuales

**Pasos manuales pendientes**

1. En Supabase, desactivar **Confirm email** (Authentication → Sign In / Providers → Email).
2. Crear el repositorio `costea` en GitHub, subir el proyecto y activar **Settings → Pages → Source: GitHub Actions**.
3. Probar en la URL publicada: registro, inicio y cierre de sesión, y que una segunda cuenta no vea los datos de la primera.

**Limitaciones reales de esta versión**

- Sin impuestos: los precios son antes de impuestos.
- Sin correos: no hay confirmación de cuenta ni recuperación de contraseña. Si alguien olvida su
  contraseña, el administrador puede eliminar el usuario en Supabase (Authentication → Users) para que
  se registre de nuevo (sus datos se eliminan con él).
- Sin confirmación de correo, cualquiera puede registrarse con un correo que no es suyo; cada cuenta
  igual solo ve sus propios datos.
- Sin densidades: no hay conversión entre masa y volumen (g ↔ ml); el motor la acepta solo con un factor explícito, y la interfaz solo ofrece unidades compatibles.
- Una moneda por negocio, sin conversiones.
- Los gastos compartidos son una estimación por horas de producción.
- El modo demo guarda los datos solo en el `localStorage` de ese navegador; no se migran a una cuenta.
- La “edición” de un producto reemplaza sus líneas en cada guardado (dentro de una transacción).
- Si dos pestañas editan el mismo producto, gana el último guardado (no hay control de concurrencia).
