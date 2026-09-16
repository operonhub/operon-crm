-- ============================================================
-- Zernio — cimientos de la integración (CRM 2.0, Fase 0)
--
-- Zernio (https://zernio.com/api/v1) es el agregador que expone WhatsApp e
-- Instagram detrás de una sola API. Esta migración NO trae mensajes ni
-- contenido todavía: sólo monta las tres piezas sobre las que se apoyan las
-- fases siguientes.
--
--   1. `social_accounts`      espejo de las cuentas conectadas en Zernio.
--   2. `social_webhook_events` bitácora + deduplicación de eventos entrantes.
--   3. `social_sync_state`     dónde quedó cada sincronización.
--
-- Ningún secreto vive acá. La API key y el secreto de webhook son variables de
-- entorno del servidor, igual que `HERMES_API_KEY` y a diferencia de nada que
-- la base guarde: `automations.secret_ref` ya fijó ese criterio en 0001.
--
-- Aditiva. No toca migraciones históricas ni tablas existentes.
-- ============================================================

-- ------------------------------------------------------------
-- Cuentas conectadas
-- ------------------------------------------------------------
-- Espejo local de `GET /v1/accounts`. Existe para que la UI no dependa de una
-- llamada a Zernio en cada render (su presupuesto de analíticas es de 6 a 20
-- pedidos por SEGUNDO para toda la cuenta) y para poder hacer FK desde las
-- conversaciones y el contenido que llegan en las fases 1 y 2.
--
-- `platform` es texto con check y no un enum a propósito: Zernio soporta 16
-- plataformas y suma más. Ampliar un check es una línea en la próxima
-- migración; sacar un valor de un enum, en cambio, no se puede.
create table public.social_accounts (
  id                uuid primary key default gen_random_uuid(),
  -- Identificador de Zernio (`_id`). Es la clave natural de toda la integración.
  zernio_account_id text not null unique
    check (length(btrim(zernio_account_id)) between 1 and 128),
  -- El "profile" de Zernio agrupa cuentas: uno por marca o por cliente.
  -- Hoy Operon usa uno solo, pero la columna deja lista la puerta multi-cliente.
  zernio_profile_id text
    check (zernio_profile_id is null or length(btrim(zernio_profile_id)) between 1 and 128),
  platform          text not null
    check (platform in ('whatsapp','instagram','facebook','telegram','other')),
  username          text,
  display_name      text,
  profile_url       text,
  avatar_url        text,
  -- `false` cuando Zernio reporta la cuenta desconectada: la UI tiene que poder
  -- decir "hay que reconectar" en vez de mostrar una sección vacía sin razón.
  is_active         boolean not null default true,
  follower_count    integer check (follower_count is null or follower_count >= 0),
  connected_at      timestamptz,
  -- Frescura del dato. La doc de Zernio recomienda mostrarla en vez de
  -- prometer tiempo real: las métricas de plataforma llegan con ~24h de atraso.
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index social_accounts_platform_idx
  on public.social_accounts (platform)
  where is_active;

comment on table public.social_accounts is
  'Cuentas de WhatsApp/Instagram conectadas en Zernio. Sin credenciales: la API key vive en el entorno del servidor.';

-- ------------------------------------------------------------
-- Eventos de webhook
-- ------------------------------------------------------------
-- Zernio entrega *at-least-once*: reintenta hasta 7 veces y un 2xx que tarda
-- más de 5 segundos cuenta como fallo, así que el mismo evento puede llegar
-- varias veces. `zernio_event_id` es único y ESE es el mecanismo de
-- deduplicación: el handler inserta primero y, si choca, ya lo procesó y corta.
--
-- Guardar el payload completo es deliberado: cuando un mensaje no aparezca en
-- la Bandeja, la única forma de saber si Zernio no lo mandó o si nosotros lo
-- procesamos mal es tener el cuerpo original.
create table public.social_webhook_events (
  id              uuid primary key default gen_random_uuid(),
  zernio_event_id text not null unique
    check (length(btrim(zernio_event_id)) between 1 and 128),
  event_type      text not null
    check (length(btrim(event_type)) between 1 and 80),
  status          text not null default 'pending'
    check (status in ('pending','processed','ignored','failed')),
  error_message   text,
  -- Contiene texto de mensajes reales: es dato personal, no log de depuración.
  payload         jsonb not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz
);

-- Para la purga por antigüedad y para mirar "qué llegó hoy" sin escanear todo.
create index social_webhook_events_received_idx
  on public.social_webhook_events (received_at desc);

-- Los pendientes y los fallidos son los que hay que revisar: índice parcial.
create index social_webhook_events_pending_idx
  on public.social_webhook_events (received_at)
  where status in ('pending','failed');

comment on table public.social_webhook_events is
  'Bitácora y deduplicación de webhooks de Zernio. El índice único sobre zernio_event_id es lo que hace idempotente la ingesta.';

-- ------------------------------------------------------------
-- Estado de las sincronizaciones
-- ------------------------------------------------------------
-- Una fila por tarea ('accounts', 'inbox_backfill', 'posts_hot', 'stories',
-- 'followers'). Sirve para tres cosas: que un cron que se cayó retome desde el
-- cursor, que la UI muestre cuándo se actualizó por última vez, y que un error
-- de sincronización sea visible en pantalla en vez de morir en un log.
create table public.social_sync_state (
  sync_key         text primary key
    check (length(btrim(sync_key)) between 1 and 60),
  cursor           text,
  last_run_at      timestamptz,
  last_success_at  timestamptz,
  last_error       text,
  items_synced     integer not null default 0 check (items_synced >= 0),
  -- Datos que devuelve la API junto con el resultado y que no son de una
  -- cuenta en particular. Hoy: `hasAnalyticsAccess`, que dice si el add-on de
  -- analíticas está activo y por lo tanto si Redes sociales va a tener alcance
  -- e impresiones o sólo likes. Nunca secretos.
  metadata         jsonb,
  updated_at       timestamptz not null default now()
);

comment on table public.social_sync_state is
  'Cursor y última corrida de cada sincronización con Zernio. Hace visible en la UI cuándo se actualizó cada dato.';

-- ------------------------------------------------------------
-- Autorización
-- ------------------------------------------------------------
-- Mismo criterio que 0012: leer es cosa de cualquier miembro, escribir es cosa
-- de admin, y no hay DELETE por política (lo que se borra, se borra con una
-- migración o con service_role, nunca desde la app).
alter table public.social_accounts       enable row level security;
alter table public.social_webhook_events enable row level security;
alter table public.social_sync_state     enable row level security;

create policy "social_accounts_member_read" on public.social_accounts
  for select to authenticated
  using (public.is_internal_member());

create policy "social_accounts_admin_insert" on public.social_accounts
  for insert to authenticated
  with check (public.is_internal_admin());

create policy "social_accounts_admin_update" on public.social_accounts
  for update to authenticated
  using (public.is_internal_admin())
  with check (public.is_internal_admin());

-- Los eventos son de sólo lectura para todo el equipo. Quien escribe es el
-- endpoint del webhook, que en la fase 1 pasa por una función SECURITY DEFINER
-- —igual que `ingest_lead` en 0004— y por eso no necesita política de INSERT.
create policy "social_webhook_events_member_read" on public.social_webhook_events
  for select to authenticated
  using (public.is_internal_member());

create policy "social_sync_state_member_read" on public.social_sync_state
  for select to authenticated
  using (public.is_internal_member());

create policy "social_sync_state_admin_insert" on public.social_sync_state
  for insert to authenticated
  with check (public.is_internal_admin());

create policy "social_sync_state_admin_update" on public.social_sync_state
  for update to authenticated
  using (public.is_internal_admin())
  with check (public.is_internal_admin());

-- ------------------------------------------------------------
-- updated_at automático
-- ------------------------------------------------------------
drop trigger if exists social_accounts_set_updated_at on public.social_accounts;
create trigger social_accounts_set_updated_at
  before update on public.social_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists social_sync_state_set_updated_at on public.social_sync_state;
create trigger social_sync_state_set_updated_at
  before update on public.social_sync_state
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
