# Operon CRM

CRM interno de Operon: pipeline comercial (lead → oportunidad → cliente) con módulos de
proyectos (landing pages) y automatizaciones (n8n). Uso interno para Santiago y Tomi.

> Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Supabase (Postgres, Auth, RLS).

## Estado

MVP en construcción. Fases (ver plan de producto en `docs/`):

- [x] **Fase 1** — Fundación: esquema, RLS, auth, seed.
- [x] Auth + shell + Dashboard "Hoy".
- [ ] **Fase 2** — Ventas y seguimiento (leads, orgs, pipeline Kanban, actividades).
- [ ] **Fase 3** — Clientes y entrega (proyectos + checklists).
- [ ] **Fase 4** — Métricas + endpoint n8n.
- [ ] **Fase 5** — Calidad, seguridad y deploy.

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

Seed ficticio (no contiene datos reales): `supabase/seed.sql`.

Aplicá migraciones y seed con la [Supabase CLI](https://supabase.com/docs/guides/local-development):

```bash
supabase db reset            # aplica migrations + seed en la base local
```

> En remoto, las migraciones ya fueron aplicadas al proyecto de desarrollo vía Supabase.

### Usuarios de desarrollo (seed)

| Email | Rol | Password |
|---|---|---|
| `tomi@operon.dev` | admin | `Operon2026!` |
| `santiago@operon.dev` | admin | `Operon2026!` |

## Seguridad

- **RLS activo** en todas las tablas: un usuario anónimo no ve ningún dato interno.
- El CRM **no almacena** contraseñas, API keys ni tokens de clientes. `automations.secret_ref`
  guarda únicamente una etiqueta/referencia; el valor vive en n8n / gestor de secretos.

## Scripts

```bash
npm run dev     # desarrollo
npm run build   # build de producción
npm run lint    # eslint
```
