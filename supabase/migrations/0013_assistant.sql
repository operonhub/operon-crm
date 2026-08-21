-- ============================================================
-- Operon IA — persistencia del asistente
--
-- Tres tablas, todas privadas por persona. A diferencia de las tablas del
-- núcleo (que son compartidas por el equipo), acá el aislamiento es la
-- característica principal: la conversación de una persona no existe para la
-- otra. Verificado en `src/lib/assistant/storage.test.ts`.
--
-- No se reutiliza `conversations` (Bandeja) a propósito: esa tabla exige
-- `author_id` de un perfil humano y su canal es un enum de equipo/clientes.
-- Meter al asistente ahí obligaría a crear un perfil falso en el roster.
--
-- Aditiva. No toca migraciones históricas ni tablas existentes.
-- ============================================================

-- ------------------------------------------------------------
-- Preferencias personales (estilo, nunca permisos)
-- ------------------------------------------------------------
-- Los catálogos replican `src/lib/assistant/policy.ts`: la base rechaza lo que
-- el código no sabe interpretar, así una fila corrupta no llega al prompt.
create table public.assistant_profiles (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null unique references auth.users(id) on delete cascade,
  display_name              text not null default 'Operon IA',
  preferred_user_name       text not null default '',
  tone                      text not null default 'neutral'
    check (tone in ('directo','neutral','cercano')),
  technical_level           text not null default 'intermedio'
    check (technical_level in ('basico','intermedio','avanzado')),
  verbosity                 text not null default 'equilibrada'
    check (verbosity in ('breve','equilibrada','detallada')),
  humor_level               text not null default 'ninguno'
    check (humor_level in ('ninguno','leve','frecuente')),
  geek_reference_frequency  text not null default 'nunca'
    check (geek_reference_frequency in ('nunca','ocasional','frecuente')),
  proactivity_level         text not null default 'media'
    check (proactivity_level in ('baja','media','alta')),
  preferred_response_format text not null default 'conclusion_primero'
    check (preferred_response_format in ('conclusion_primero','narrativo','puntos')),
  preferred_language        text not null default 'es-AR',
  custom_preferences        text
    check (custom_preferences is null or length(custom_preferences) <= 2000),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Conversaciones
-- ------------------------------------------------------------
create table public.assistant_conversations (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null references auth.users(id) on delete cascade,
  title             text not null default 'Nueva conversación',
  -- Desde dónde se abrió, para dar contexto. El backend revalida el id.
  context_type      text not null default 'general'
    check (context_type in ('general','dashboard','client','opportunity',
                            'project','finance','inbox','agent')),
  context_id        uuid,
  /**
   * Identificador de transcripción que se manda a Hermes como
   * `X-Hermes-Session-Id`. No es un secreto: sólo agrupa mensajes.
   */
  hermes_session_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz
);

create index assistant_conversations_owner_idx
  on public.assistant_conversations (owner_user_id, updated_at desc);

-- ------------------------------------------------------------
-- Mensajes
-- ------------------------------------------------------------
create table public.assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.assistant_conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null default '',
  -- `streaming` existe para poder mostrar una respuesta a medio llegar y
  -- distinguirla de una que terminó bien.
  status          text not null default 'complete'
    check (status in ('pending','streaming','complete','error')),
  -- Fuentes web, herramientas usadas, latencia. Nunca secretos.
  source_metadata jsonb,
  created_at      timestamptz not null default now()
);

create index assistant_messages_conversation_idx
  on public.assistant_messages (conversation_id, created_at);

-- ------------------------------------------------------------
-- Autorización
-- ------------------------------------------------------------
alter table public.assistant_profiles      enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages      enable row level security;

/**
 * Dueño de una conversación. SECURITY DEFINER con search_path fijo para no
 * reentrar en RLS al evaluarse desde las políticas de mensajes.
 */
create or replace function public.owns_assistant_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assistant_conversations c
    where c.id = p_conversation_id
      and c.owner_user_id = auth.uid()
  );
$$;

-- Las políticas de `assistant_messages` la invocan como el usuario que
-- consulta, así que `authenticated` necesita EXECUTE explícito. Sin esto,
-- leer o escribir mensajes falla con "permission denied for function".
revoke execute on function public.owns_assistant_conversation(uuid) from public, anon;
grant execute on function public.owns_assistant_conversation(uuid) to authenticated;

-- Perfiles: sólo el propio. `with check` en UPDATE impide además mudarlo a
-- otra identidad, porque evalúa la fila resultante.
create policy "assistant_profiles_own_read" on public.assistant_profiles
  for select to authenticated
  using (user_id = auth.uid() and public.is_internal_member());

create policy "assistant_profiles_own_insert" on public.assistant_profiles
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_internal_member());

create policy "assistant_profiles_own_update" on public.assistant_profiles
  for update to authenticated
  using (user_id = auth.uid() and public.is_internal_member())
  with check (user_id = auth.uid() and public.is_internal_member());

-- Conversaciones: propias, con derecho a archivar y borrar las propias.
create policy "assistant_conversations_own_read" on public.assistant_conversations
  for select to authenticated
  using (owner_user_id = auth.uid() and public.is_internal_member());

create policy "assistant_conversations_own_insert" on public.assistant_conversations
  for insert to authenticated
  with check (owner_user_id = auth.uid() and public.is_internal_member());

create policy "assistant_conversations_own_update" on public.assistant_conversations
  for update to authenticated
  using (owner_user_id = auth.uid() and public.is_internal_member())
  with check (owner_user_id = auth.uid() and public.is_internal_member());

create policy "assistant_conversations_own_delete" on public.assistant_conversations
  for delete to authenticated
  using (owner_user_id = auth.uid() and public.is_internal_member());

-- Mensajes: dependen por completo de la conversación.
create policy "assistant_messages_own_read" on public.assistant_messages
  for select to authenticated
  using (public.owns_assistant_conversation(conversation_id));

create policy "assistant_messages_own_insert" on public.assistant_messages
  for insert to authenticated
  with check (public.owns_assistant_conversation(conversation_id));

create policy "assistant_messages_own_update" on public.assistant_messages
  for update to authenticated
  using (public.owns_assistant_conversation(conversation_id))
  with check (public.owns_assistant_conversation(conversation_id));

-- Sin DELETE de mensajes sueltos: se borran con su conversación (cascade).

-- ------------------------------------------------------------
-- updated_at automático
-- ------------------------------------------------------------
create trigger assistant_profiles_set_updated_at
  before update on public.assistant_profiles
  for each row execute function public.set_updated_at();

create trigger assistant_conversations_set_updated_at
  before update on public.assistant_conversations
  for each row execute function public.set_updated_at();
