-- ============================================================
-- Operon CRM — colaboración y Bandeja
-- Conversaciones con relaciones explícitas, menciones transaccionales,
-- notificaciones personales y actualización diaria única.
-- ============================================================

do $$ begin
  create type public.conversation_channel as enum ('team', 'client', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.conversation_status as enum ('open', 'resolved', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.collaboration_request_status as enum ('pending', 'accepted', 'resolved', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 180),
  channel public.conversation_channel not null default 'team',
  status public.conversation_status not null default 'open',
  context_type text not null default 'general'
    check (context_type in ('general', 'client', 'opportunity', 'project', 'task', 'finance', 'agent')),
  client_id uuid references public.clients(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.project_tasks(id) on delete set null,
  financial_record_id uuid references public.financial_records(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  assigned_to uuid references public.profiles(id),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  archived_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  constraint conversations_context_integrity check (
    (context_type = 'general' and num_nonnulls(client_id, opportunity_id, project_id, task_id, financial_record_id, agent_id) = 0)
    or (context_type = 'client' and client_id is not null and num_nonnulls(client_id, opportunity_id, project_id, task_id, financial_record_id, agent_id) = 1)
    or (context_type = 'opportunity' and opportunity_id is not null and num_nonnulls(client_id, opportunity_id, project_id, task_id, financial_record_id, agent_id) = 1)
    or (context_type = 'project' and project_id is not null and num_nonnulls(client_id, opportunity_id, project_id, task_id, financial_record_id, agent_id) = 1)
    or (context_type = 'task' and task_id is not null and num_nonnulls(client_id, opportunity_id, project_id, task_id, financial_record_id, agent_id) = 1)
    or (context_type = 'finance' and financial_record_id is not null and num_nonnulls(client_id, opportunity_id, project_id, task_id, financial_record_id, agent_id) = 1)
    or (context_type = 'agent' and agent_id is not null and num_nonnulls(client_id, opportunity_id, project_id, task_id, financial_record_id, agent_id) = 1)
  )
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) between 1 and 8000),
  message_kind text not null default 'message'
    check (message_kind in ('message', 'system', 'decision', 'handoff', 'review')),
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.message_mentions (
  message_id uuid not null references public.conversation_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null check (notification_type in (
    'mention', 'message', 'assignment', 'handoff', 'review', 'decision', 'system', 'agent_approval'
  )),
  title text not null check (length(btrim(title)) between 1 and 180),
  body text,
  href text,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.conversation_messages(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_handoffs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_profile_id uuid not null references public.profiles(id),
  to_profile_id uuid not null references public.profiles(id),
  note text,
  status public.collaboration_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint assignment_handoffs_distinct_people check (from_profile_id <> to_profile_id)
);

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  requested_from uuid not null references public.profiles(id),
  note text,
  status public.collaboration_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint review_requests_distinct_people check (requested_by <> requested_from)
);

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 180),
  body text,
  decided_by uuid not null references public.profiles(id),
  decided_at timestamptz not null default now(),
  superseded_by uuid references public.decisions(id) on delete set null
);

create table if not exists public.daily_updates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  update_date date not null default current_date,
  progress text not null check (length(btrim(progress)) between 1 and 2000),
  next_focus text,
  blocker text,
  needs_help boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, update_date)
);

create index if not exists conversations_inbox_idx
  on public.conversations (channel, status, last_message_at desc);
create index if not exists conversations_assigned_idx
  on public.conversations (assigned_to, status, last_message_at desc);
create index if not exists conversation_messages_thread_idx
  on public.conversation_messages (conversation_id, created_at);
create index if not exists conversation_participants_profile_idx
  on public.conversation_participants (profile_id, conversation_id);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;
create index if not exists notifications_recipient_history_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists handoffs_recipient_pending_idx
  on public.assignment_handoffs (to_profile_id, created_at desc)
  where status = 'pending';
create index if not exists reviews_recipient_pending_idx
  on public.review_requests (requested_from, created_at desc)
  where status = 'pending';
create index if not exists daily_updates_date_idx
  on public.daily_updates (update_date desc, profile_id);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();
drop trigger if exists daily_updates_set_updated_at on public.daily_updates;
create trigger daily_updates_set_updated_at
  before update on public.daily_updates
  for each row execute function public.set_updated_at();

create or replace function public.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

revoke execute on function public.touch_conversation_after_message() from public, anon, authenticated;

drop trigger if exists conversation_messages_touch_thread on public.conversation_messages;
create trigger conversation_messages_touch_thread
  after insert on public.conversation_messages
  for each row execute function public.touch_conversation_after_message();

-- ---------- Helpers RLS sin recursión ----------
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id
      and profile_id = auth.uid()
  );
$$;

revoke execute on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

-- ---------- Mensaje + menciones + notificaciones atómicas ----------
create or replace function public.create_team_message(
  p_body text,
  p_conversation_id uuid default null,
  p_title text default null,
  p_mention_ids uuid[] default '{}',
  p_assigned_to uuid default null,
  p_client_id uuid default null,
  p_opportunity_id uuid default null,
  p_project_id uuid default null,
  p_task_id uuid default null,
  p_financial_record_id uuid default null,
  p_agent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_conversation_id uuid;
  v_message_id uuid;
  v_context_type text := 'general';
  v_context_count integer;
  v_mention_id uuid;
begin
  if v_actor is null or not public.is_internal_member() then
    raise exception 'Sesión no autorizada.';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'El mensaje no puede estar vacío.';
  end if;

  if p_conversation_id is null then
    if length(btrim(coalesce(p_title, ''))) = 0 then
      raise exception 'El asunto es obligatorio para una conversación nueva.';
    end if;

    v_context_count := num_nonnulls(
      p_client_id, p_opportunity_id, p_project_id,
      p_task_id, p_financial_record_id, p_agent_id
    );
    if v_context_count > 1 then
      raise exception 'Una conversación solo puede tener un contexto.';
    end if;
    if p_client_id is not null then v_context_type := 'client'; end if;
    if p_opportunity_id is not null then v_context_type := 'opportunity'; end if;
    if p_project_id is not null then v_context_type := 'project'; end if;
    if p_task_id is not null then v_context_type := 'task'; end if;
    if p_financial_record_id is not null then v_context_type := 'finance'; end if;
    if p_agent_id is not null then v_context_type := 'agent'; end if;

    insert into public.conversations (
      title, channel, context_type, client_id, opportunity_id, project_id,
      task_id, financial_record_id, agent_id, assigned_to, created_by
    ) values (
      btrim(p_title), 'team', v_context_type, p_client_id, p_opportunity_id,
      p_project_id, p_task_id, p_financial_record_id, p_agent_id,
      p_assigned_to, v_actor
    ) returning id into v_conversation_id;

    -- La Bandeja Equipo es compartida: todos los perfiles internos participan.
    insert into public.conversation_participants (conversation_id, profile_id, last_read_at)
    select v_conversation_id, id, case when id = v_actor then now() else null end
    from public.profiles
    on conflict do nothing;
  else
    v_conversation_id := p_conversation_id;
    if not public.is_conversation_participant(v_conversation_id) then
      raise exception 'No participás de esta conversación.';
    end if;
  end if;

  insert into public.conversation_messages (conversation_id, author_id, body)
  values (v_conversation_id, v_actor, btrim(p_body))
  returning id into v_message_id;

  update public.conversation_participants
  set last_read_at = now()
  where conversation_id = v_conversation_id and profile_id = v_actor;

  foreach v_mention_id in array coalesce(p_mention_ids, '{}'::uuid[]) loop
    if exists (select 1 from public.profiles where id = v_mention_id) then
      insert into public.message_mentions (message_id, profile_id)
      values (v_message_id, v_mention_id)
      on conflict do nothing;

      if v_mention_id <> v_actor then
        insert into public.notifications (
          recipient_id, actor_id, notification_type, title, body, href,
          conversation_id, message_id
        ) values (
          v_mention_id, v_actor, 'mention', 'Te mencionaron en Equipo',
          left(btrim(p_body), 240), '/bandeja?tab=equipo&conversation=' || v_conversation_id,
          v_conversation_id, v_message_id
        );
      end if;
    end if;
  end loop;

  if p_conversation_id is null and p_assigned_to is not null and p_assigned_to <> v_actor then
    insert into public.notifications (
      recipient_id, actor_id, notification_type, title, body, href, conversation_id, message_id
    ) values (
      p_assigned_to, v_actor, 'assignment', 'Te toca una conversación',
      btrim(p_title), '/bandeja?tab=equipo&conversation=' || v_conversation_id,
      v_conversation_id, v_message_id
    );
  end if;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'message_id', v_message_id
  );
end;
$$;

revoke execute on function public.create_team_message(text, uuid, text, uuid[], uuid, uuid, uuid, uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.create_team_message(text, uuid, text, uuid[], uuid, uuid, uuid, uuid, uuid, uuid, uuid)
  to authenticated;

create or replace function public.create_internal_notification(
  p_recipient_id uuid,
  p_notification_type text,
  p_title text,
  p_body text default null,
  p_href text default null,
  p_conversation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_internal_member() then
    raise exception 'Sesión no autorizada.';
  end if;
  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'Destinatario inválido.';
  end if;
  if p_notification_type not in ('assignment','handoff','review','decision','system','agent_approval') then
    raise exception 'Tipo de notificación inválido.';
  end if;

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, href, conversation_id
  ) values (
    p_recipient_id, auth.uid(), p_notification_type, btrim(p_title), p_body, p_href, p_conversation_id
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_internal_notification(uuid, text, text, text, text, uuid)
  from public, anon;
grant execute on function public.create_internal_notification(uuid, text, text, text, text, uuid)
  to authenticated;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_conversation_participant(p_conversation_id) then
    raise exception 'No participás de esta conversación.';
  end if;
  update public.conversation_participants
  set last_read_at = now()
  where conversation_id = p_conversation_id and profile_id = auth.uid();
end;
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array[
    'conversations', 'conversation_participants', 'conversation_messages',
    'message_mentions', 'notifications', 'assignment_handoffs',
    'review_requests', 'decisions', 'daily_updates'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

drop policy if exists "conversations_participant_read" on public.conversations;
drop policy if exists "conversations_participant_update" on public.conversations;
create policy "conversations_participant_read" on public.conversations
  for select to authenticated using (public.is_conversation_participant(id));
create policy "conversations_participant_update" on public.conversations
  for update to authenticated
  using (public.is_conversation_participant(id))
  with check (public.is_conversation_participant(id));

drop policy if exists "participants_thread_read" on public.conversation_participants;
create policy "participants_thread_read" on public.conversation_participants
  for select to authenticated using (public.is_conversation_participant(conversation_id));

drop policy if exists "messages_thread_read" on public.conversation_messages;
create policy "messages_thread_read" on public.conversation_messages
  for select to authenticated using (public.is_conversation_participant(conversation_id));

drop policy if exists "mentions_thread_read" on public.message_mentions;
create policy "mentions_thread_read" on public.message_mentions
  for select to authenticated using (
    exists (
      select 1 from public.conversation_messages m
      where m.id = message_id and public.is_conversation_participant(m.conversation_id)
    )
  );

drop policy if exists "notifications_owner_read" on public.notifications;
drop policy if exists "notifications_owner_update" on public.notifications;
create policy "notifications_owner_read" on public.notifications
  for select to authenticated using (recipient_id = auth.uid());
create policy "notifications_owner_update" on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists "handoffs_participant_all" on public.assignment_handoffs;
drop policy if exists "handoffs_participant_read" on public.assignment_handoffs;
drop policy if exists "handoffs_sender_insert" on public.assignment_handoffs;
drop policy if exists "handoffs_people_update" on public.assignment_handoffs;
create policy "handoffs_participant_read" on public.assignment_handoffs
  for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy "handoffs_sender_insert" on public.assignment_handoffs
  for insert to authenticated with check (
    public.is_conversation_participant(conversation_id) and from_profile_id = auth.uid()
  );
create policy "handoffs_people_update" on public.assignment_handoffs
  for update to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    and auth.uid() in (from_profile_id, to_profile_id)
  )
  with check (
    public.is_conversation_participant(conversation_id)
    and auth.uid() in (from_profile_id, to_profile_id)
  );

drop policy if exists "reviews_participant_all" on public.review_requests;
drop policy if exists "reviews_participant_read" on public.review_requests;
drop policy if exists "reviews_requester_insert" on public.review_requests;
drop policy if exists "reviews_people_update" on public.review_requests;
create policy "reviews_participant_read" on public.review_requests
  for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy "reviews_requester_insert" on public.review_requests
  for insert to authenticated with check (
    public.is_conversation_participant(conversation_id) and requested_by = auth.uid()
  );
create policy "reviews_people_update" on public.review_requests
  for update to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    and auth.uid() in (requested_by, requested_from)
  )
  with check (
    public.is_conversation_participant(conversation_id)
    and auth.uid() in (requested_by, requested_from)
  );

drop policy if exists "decisions_participant_read" on public.decisions;
drop policy if exists "decisions_participant_insert" on public.decisions;
create policy "decisions_participant_read" on public.decisions
  for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy "decisions_participant_insert" on public.decisions
  for insert to authenticated with check (
    public.is_conversation_participant(conversation_id) and decided_by = auth.uid()
  );

drop policy if exists "daily_updates_team_read" on public.daily_updates;
drop policy if exists "daily_updates_owner_insert" on public.daily_updates;
drop policy if exists "daily_updates_owner_update" on public.daily_updates;
create policy "daily_updates_team_read" on public.daily_updates
  for select to authenticated using (public.is_internal_member());
create policy "daily_updates_owner_insert" on public.daily_updates
  for insert to authenticated with check (profile_id = auth.uid());
create policy "daily_updates_owner_update" on public.daily_updates
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

grant select, update on public.conversations to authenticated;
grant select on public.conversation_participants to authenticated;
grant select on public.conversation_messages to authenticated;
grant select on public.message_mentions to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert, update on public.assignment_handoffs to authenticated;
grant select, insert, update on public.review_requests to authenticated;
grant select, insert on public.decisions to authenticated;
grant select, insert, update on public.daily_updates to authenticated;

notify pgrst, 'reload schema';
