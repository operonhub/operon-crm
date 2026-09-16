-- ============================================================
-- Redes sociales — contenido y métricas (CRM 2.0, Fase 2)
--
-- Espejo local de lo que Operon publica en Instagram, con su rendimiento.
-- La UI nunca llama a Zernio: sus endpoints de analíticas comparten un
-- presupuesto de 6 a 20 pedidos por SEGUNDO para toda la cuenta, así que un
-- dashboard que consultara en cada render lo agotaría solo.
--
-- La decisión de diseño que manda acá es **guardar fotos diarias, no totales**.
-- Si se guardara sólo el acumulado de cada post, lo único que se podría decir
-- es "este reel tiene 143 vistas". Con una foto por día se puede decir "sumó 40
-- vistas esta semana" y "lo de septiembre rinde mejor que lo de agosto", que es
-- lo que sirve para decidir qué publicar.
--
-- Aditiva. No toca migraciones históricas ni tablas existentes.
-- ============================================================

-- ------------------------------------------------------------
-- Publicaciones
-- ------------------------------------------------------------
create table public.social_posts (
  id                  uuid primary key default gen_random_uuid(),
  zernio_post_id      text not null unique
    check (length(btrim(zernio_post_id)) between 1 and 128),
  social_account_id   uuid not null
    references public.social_accounts(id) on delete cascade,
  platform            text not null
    check (platform in ('whatsapp','instagram','facebook','telegram','other')),

  -- `media_type` es la forma (imagen/carrusel/video) y `format` es dónde vive
  -- (feed o reel). Instagram los reporta por separado y no son equivalentes:
  -- un reel es siempre video, pero un video puede no ser reel.
  media_type          text
    check (media_type is null or media_type in ('image','video','carousel','other')),
  format              text not null default 'feed'
    check (format in ('feed','reel','story','other')),

  caption             text,
  thumbnail_url       text,
  permalink           text,
  published_at        timestamptz,
  -- Para calcular retención: cuánto del video se mira sobre cuánto dura.
  video_duration_seconds integer
    check (video_duration_seconds is null or video_duration_seconds >= 0),
  is_ad               boolean not null default false,

  -- Zernio publica insights con retraso y por tandas. Sin esto, un post sin
  -- métricas no se distingue de uno que rindió cero.
  metrics_synced_at   timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index social_posts_timeline_idx
  on public.social_posts (published_at desc nulls last);

create index social_posts_format_idx
  on public.social_posts (format, published_at desc);

-- ------------------------------------------------------------
-- Métricas de publicaciones — una foto por día
-- ------------------------------------------------------------
create table public.social_post_metrics (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.social_posts(id) on delete cascade,
  -- Fecha, no instante: una foto por día alcanza y hace trivial el "cuánto
  -- sumó esta semana" sin tener que agrupar por hora.
  captured_on       date not null default current_date,

  impressions       integer not null default 0 check (impressions >= 0),
  reach             integer not null default 0 check (reach >= 0),
  likes             integer not null default 0 check (likes >= 0),
  comments          integer not null default 0 check (comments >= 0),
  shares            integer not null default 0 check (shares >= 0),
  saves             integer not null default 0 check (saves >= 0),
  views             integer not null default 0 check (views >= 0),
  follows           integer not null default 0 check (follows >= 0),
  profile_views     integer not null default 0 check (profile_views >= 0),

  -- Sólo reels. `avg_watch_time_ms` viene en milisegundos desde Instagram.
  avg_watch_time_ms integer check (avg_watch_time_ms is null or avg_watch_time_ms >= 0),
  skip_rate         numeric(5,2) check (skip_rate is null or skip_rate between 0 and 100),

  captured_at       timestamptz not null default now(),

  -- Una sola foto por post por día: si el cron corre varias veces, actualiza.
  constraint social_post_metrics_unique_day unique (post_id, captured_on)
);

create index social_post_metrics_post_idx
  on public.social_post_metrics (post_id, captured_on desc);

comment on table public.social_post_metrics is
  'Una foto diaria por publicación. Los deltas entre fotos son lo que permite hablar de evolución y no sólo de acumulado.';

-- ------------------------------------------------------------
-- Historias
-- ------------------------------------------------------------
-- Instagram borra las historias a las 24 horas y Zernio no guarda histórico:
-- sólo lista las que están vivas. Este histórico se construye desde cero, con
-- un cron que las fotografía antes de que expiren. Lo anterior a prender ese
-- cron no existe en ningún lado y no se puede recuperar.
create table public.social_stories (
  id                uuid primary key default gen_random_uuid(),
  zernio_story_id   text not null unique
    check (length(btrim(zernio_story_id)) between 1 and 128),
  social_account_id uuid not null
    references public.social_accounts(id) on delete cascade,
  media_type        text
    check (media_type is null or media_type in ('image','video','other')),
  thumbnail_url     text,
  permalink         text,
  posted_at         timestamptz not null,
  -- Calculado al capturarla: posted_at + 24h. Sirve para saber si la foto de
  -- métricas que tenemos es la última que vamos a poder sacar.
  expires_at        timestamptz,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index social_stories_timeline_idx
  on public.social_stories (posted_at desc);

create table public.social_story_metrics (
  id            uuid primary key default gen_random_uuid(),
  story_id      uuid not null references public.social_stories(id) on delete cascade,
  captured_at   timestamptz not null default now(),
  views         integer not null default 0 check (views >= 0),
  reach         integer not null default 0 check (reach >= 0),
  replies       integer not null default 0 check (replies >= 0),
  -- Navegación: cuánta gente siguió de largo, volvió atrás o se fue del todo.
  taps_forward  integer not null default 0 check (taps_forward >= 0),
  taps_back     integer not null default 0 check (taps_back >= 0),
  exits         integer not null default 0 check (exits >= 0),
  profile_visits integer not null default 0 check (profile_visits >= 0)
);

create index social_story_metrics_story_idx
  on public.social_story_metrics (story_id, captured_at desc);

-- ------------------------------------------------------------
-- Seguidores
-- ------------------------------------------------------------
create table public.social_follower_stats (
  id                uuid primary key default gen_random_uuid(),
  social_account_id uuid not null
    references public.social_accounts(id) on delete cascade,
  captured_on       date not null default current_date,
  follower_count    integer not null check (follower_count >= 0),
  gained            integer check (gained is null or gained >= 0),
  lost              integer check (lost is null or lost >= 0),
  captured_at       timestamptz not null default now(),

  constraint social_follower_stats_unique_day unique (social_account_id, captured_on)
);

create index social_follower_stats_idx
  on public.social_follower_stats (social_account_id, captured_on desc);

-- ------------------------------------------------------------
-- Autorización
-- ------------------------------------------------------------
-- Mismo criterio que 0014 y 0015: lee cualquier miembro, escribe sólo admin
-- (la sincronización la dispara un admin o el cron con su propia credencial),
-- y no hay DELETE por política.
alter table public.social_posts          enable row level security;
alter table public.social_post_metrics   enable row level security;
alter table public.social_stories        enable row level security;
alter table public.social_story_metrics  enable row level security;
alter table public.social_follower_stats enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'social_posts','social_post_metrics','social_stories',
    'social_story_metrics','social_follower_stats'
  ] loop
    execute format($f$
      drop policy if exists %1$s_member_read on public.%1$I;
      create policy %1$s_member_read on public.%1$I
        for select to authenticated using (public.is_internal_member());

      drop policy if exists %1$s_admin_insert on public.%1$I;
      create policy %1$s_admin_insert on public.%1$I
        for insert to authenticated with check (public.is_internal_admin());

      drop policy if exists %1$s_admin_update on public.%1$I;
      create policy %1$s_admin_update on public.%1$I
        for update to authenticated
        using (public.is_internal_admin()) with check (public.is_internal_admin());
    $f$, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- updated_at automático
-- ------------------------------------------------------------
drop trigger if exists social_posts_set_updated_at on public.social_posts;
create trigger social_posts_set_updated_at
  before update on public.social_posts
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
