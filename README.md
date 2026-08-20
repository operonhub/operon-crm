# Operon CRM

CRM interno de Operon para operar ventas, clientes, proyectos, métricas y finanzas
operativas en un solo lugar. Uso interno para Santiago y Tomi.

> Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Supabase (Postgres, Auth, RLS).

## Estado

MVP operativo. La navegación principal está organizada por las seis áreas de trabajo:

- **Hoy** — trabajo propio/equipo, agenda, alertas y resumen diario.
- **Clientes** — ficha operativa, contactos, proyectos, historial y saldo.
- **Pipeline** — oportunidades y leads sin duplicar el modelo comercial.
- **Proyectos** — Sites/E-commerce, Apps/SaaS, Automatizaciones/CRM y Assets/Brand.
- **Métricas** — indicadores comerciales, operativos y financieros con datos reales.
- **Finanzas** — ingresos/gastos, pagos, vencimientos y saldos separados por moneda.

Fases históricas (ver plan de producto en `docs/`):

- [x] **Fase 1** — Fundación: esquema, RLS, auth, seed.
- [x] Auth + shell + Dashboard "Hoy".
- [x] **Fase 2** — Ventas y seguimiento (leads, orgs, pipeline Kanban, actividades, CSV).
- [x] **Fase 3** — Clientes y entrega (proyectos + checklists).
- [x] **Fase 4** — Métricas + endpoint n8n.
- [x] **Fase 5** — Calidad, seguridad y deploy.

## Setup local

```bash
npm install
cp .env.example .env.local   # completar con las claves del proyecto Supabase
npm run dev                  # http://localhost:3000
```

### Variables de entorno (`.env.local`)

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key (segura para el cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — **solo servidor**. No exponer |
| `N8N_INGEST_SECRET` | Secreto del endpoint de ingesta n8n (Fase 4) |

## Base de datos

Migraciones versionadas en `supabase/migrations/` (orden por prefijo numérico):

1. `0001_core_schema.sql` — enums, tablas P0, índices, triggers.
2. `0002_rls_and_auth.sql` — RLS (solo internos autenticados) + auto-profile.
3. `0003_harden_functions.sql` — endurecimiento de funciones.
4. `0004_n8n_ingest.sql` — ingesta segura e idempotente desde n8n.
5. `0005_operational_crm.sql` — áreas/modalidad de proyectos + finanzas operativas.
6. `0006_harden_ingest_dedupe.sql` — evita entidades huérfanas al reintentar ingestas.
7. `0007_enable_data_api.sql` — expone `public` a PostgREST; RLS sigue protegiendo los datos.

Seed ficticio (no contiene datos reales): `supabase/seed.sql`.

Aplicá migraciones y seed con la [Supabase CLI](https://supabase.com/docs/guides/local-development):

```bash
supabase db reset            # aplica migrations + seed en la base local
```

> En remoto, verificá primero el proyecto vinculado y aplicá solo las migraciones
> pendientes con `supabase db push`. No uses `db reset` contra una base remota.

### Usuarios de desarrollo (seed)

| Email | Rol | Password |
|---|---|---|
| `tomi@operon.dev` | admin | `Operon2026!` |
| `santiago@operon.dev` | admin | `Operon2026!` |

## Seguridad

- **RLS activo** en todas las tablas: un usuario anónimo no ve ningún dato interno.
- El CRM **no almacena** contraseñas, API keys ni tokens de clientes. `automations.secret_ref`
  guarda únicamente una etiqueta/referencia; el valor vive en n8n / gestor de secretos.

## Endpoint de ingesta n8n

`POST /api/ingest/leads` — crea o actualiza leads desde n8n. Autenticado con
`Authorization: Bearer <N8N_INGEST_SECRET>`. **Idempotente** por `external_id`
(reenviar el mismo no duplica: actualiza). Deduplica organización por dominio y
contacto por email. Acepta un objeto o un array (hasta 100).

El secreto se verifica dentro de una función Postgres `SECURITY DEFINER`
(`ingest_lead`) contra la tabla `ingest_config`, protegida por RLS (nadie la lee
por API). Para rotarlo:

```sql
update ingest_config set secret = '<nuevo>' where id = 1;
```

y actualizar `N8N_INGEST_SECRET` en el entorno.

### Ejemplo de payload

```bash
curl -X POST https://TU-APP/api/ingest/leads \
  -H "Authorization: Bearer $N8N_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "n8n-abc-123",
    "empresa": "Distribuidora Andina",
    "web": "https://andina.com.ar",
    "contacto": "Marta Ruiz",
    "email": "marta@andina.com.ar",
    "source": "n8n",
    "service_interest": "automation",
    "segment": "Mayorista"
  }'
```

Respuesta: `{ "ok": true, "created": 1, "updated": 0, "results": [...] }`.
Los fallos inesperados quedan registrados en la tabla `ingest_errors`.

## Deploy

1. Crear un proyecto Supabase **separado** para producción y aplicar
   `supabase/migrations/` + un `ingest_config.secret` propio.
2. Desplegar en Vercel (o VPS). Cargar las variables de entorno del proyecto
   (las mismas de `.env.example`) apuntando a la base de producción.
3. En Supabase Auth, deshabilitar el registro público (los usuarios internos se
   crean a mano) y, opcionalmente, activar *leaked password protection*.

## Backup y portabilidad

- Backups automáticos de Postgres provistos por Supabase (según plan).
- Exportación puntual a SQL: `supabase db dump -f backup.sql`.
- Exportación CSV por tabla desde el dashboard de Supabase o `COPY ... TO`.

## Scripts

```bash
npm run dev     # desarrollo
npm run build   # build de producción
npm run lint    # eslint
npm run test    # vitest (reglas de negocio: dedupe, CSV)
```

## Verificaciones de calidad

Validación esperada antes de entregar cambios:

- `npm run test` → reglas de dedupe, CSV, dashboard y finanzas.
- `npm run lint` → sin errores.
- `npm run build` → compila y typecheck OK.
- RLS verificada: un anónimo no lee `leads`, `organizations` ni el secreto de
  ingesta (todas devuelven `[]`).
