-- Read model for the isolated Operon Reservas pilot. No message copies.
create or replace function public.reservas_valid_timestamp(p_value text)
returns timestamptz language plpgsql stable security invoker set search_path = public as $$
begin
  if coalesce(p_value, '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then return null; end if;
  return p_value::timestamptz;
exception when others then return null;
end;
$$;
revoke all on function public.reservas_valid_timestamp(text) from public;
grant execute on function public.reservas_valid_timestamp(text) to authenticated;

create view public.reservas_sales_projection with (security_invoker = true) as
select p.id, p.lead_id, p.sheet_id, p.sheet_lead_id, p.sheet_url, p.phone_e164,
  p.do_not_contact, p.suppression_reason, p.created_at,
  coalesce(o.name, 'Alojamiento sin nombre') as organization_name,
  owner.full_name as owner_name,
  chat.id as conversation_id,
  msg.first_outbound_at, msg.last_outbound_at, msg.last_inbound_at,
  greatest(msg.last_outbound_at, msg.last_inbound_at) as last_contact_at,
  coalesce(msg.responded, false) as responded,
  coalesce(ev.scheduled, false) as meeting_scheduled,
  coalesce(ev.held, false) as meeting_held,
  coalesce(ev.proposal, false) as proposal_sent,
  coalesce(ev.won, false) as ever_won,
  coalesce(ev.lost, false) as ever_lost,
  ev.scheduled_at, ev.held_at, ev.proposal_at, ev.won_at, ev.lost_at,
  case when business.event_type is not null then business.event_type
    when coalesce(msg.responded, false) then 'responded'
    when msg.first_outbound_at is not null then 'contacted' else 'new' end as stage,
  case when meeting.event_type = 'meeting_scheduled'
    then public.reservas_valid_timestamp(meeting.details->>'scheduled_for') end as meeting_at,
  next_step.title as next_action, next_step.due_date as next_action_date,
  case when p.do_not_contact or business.event_type in ('won', 'lost') then false else
    exists (
      select 1 from public.social_conversations c
      where c.lead_id = p.lead_id and c.platform = 'whatsapp' and c.status <> 'archived'
      and (select max(m.sent_at) from public.social_messages m where m.conversation_id = c.id
        and m.direction = 'inbound' and m.deleted_at is null and m.delivery_status in ('sent', 'delivered', 'read'))
        > coalesce((select max(m.sent_at) from public.social_messages m where m.conversation_id = c.id
          and m.direction = 'outbound' and m.deleted_at is null
          and m.delivery_status in ('sent', 'delivered', 'read')), '-infinity'::timestamptz)
    ) end as pending_response,
  case when p.do_not_contact or business.event_type in ('won', 'lost') then false
    else coalesce(next_step.due_date < (now() at time zone 'America/Argentina/Buenos_Aires')::date, false)
    end as follow_up_overdue,
  case when p.do_not_contact or business.event_type in ('won', 'lost') then false
    else coalesce(meeting.event_type = 'meeting_scheduled'
      and public.reservas_valid_timestamp(meeting.details->>'scheduled_for') >= now()
      and public.reservas_valid_timestamp(meeting.details->>'scheduled_for') <= now() + interval '48 hours', false)
    end as meeting_soon
from public.reservas_prospects p
join public.leads l on l.id = p.lead_id
left join public.organizations o on o.id = l.organization_id
left join public.profiles owner on owner.id = l.owner_id
left join lateral (
  select c.id from public.social_conversations c
  left join lateral (
    select max(m.sent_at) filter (where m.direction = 'inbound') as inbound_at,
      max(m.sent_at) filter (where m.direction = 'outbound') as outbound_at
    from public.social_messages m where m.conversation_id = c.id and m.deleted_at is null
      and m.delivery_status in ('sent', 'delivered', 'read')
  ) thread on true
  where c.lead_id = p.lead_id and c.platform = 'whatsapp'
  order by (c.status <> 'archived' and thread.inbound_at > coalesce(thread.outbound_at, '-infinity'::timestamptz)) desc nulls last,
    (c.status <> 'archived') desc, c.last_message_at desc nulls last, c.id limit 1
) chat on true
left join lateral (
  select min(m.sent_at) filter (where m.direction = 'outbound') as first_outbound_at,
    max(m.sent_at) filter (where m.direction = 'outbound') as last_outbound_at,
    max(m.sent_at) filter (where m.direction = 'inbound') as last_inbound_at,
    max(m.sent_at) filter (where m.direction = 'inbound') >
      min(m.sent_at) filter (where m.direction = 'outbound') as responded
  from public.social_messages m join public.social_conversations c on c.id = m.conversation_id
  where c.lead_id = p.lead_id and c.platform = 'whatsapp' and m.deleted_at is null
    and m.delivery_status in ('sent', 'delivered', 'read')
) msg on true
left join lateral (
  select bool_or(e.event_type = 'meeting_scheduled') as scheduled,
    bool_or(e.event_type = 'meeting_held') as held,
    bool_or(e.event_type = 'proposal_sent') as proposal,
    bool_or(e.event_type = 'won') as won, bool_or(e.event_type = 'lost') as lost,
    min(e.occurred_at) filter (where e.event_type = 'meeting_scheduled') as scheduled_at,
    min(e.occurred_at) filter (where e.event_type = 'meeting_held') as held_at,
    min(e.occurred_at) filter (where e.event_type = 'proposal_sent') as proposal_at,
    min(e.occurred_at) filter (where e.event_type = 'won') as won_at,
    min(e.occurred_at) filter (where e.event_type = 'lost') as lost_at
  from public.reservas_prospect_events e where e.prospect_id = p.id
) ev on true
left join lateral (
  select e.event_type from public.reservas_prospect_events e where e.prospect_id = p.id
    and e.event_type in ('meeting_scheduled', 'meeting_held', 'meeting_cancelled', 'proposal_sent', 'won', 'lost')
  order by e.occurred_at desc, e.recorded_at desc, e.id desc limit 1
) business on true
left join lateral (
  select e.event_type, e.details from public.reservas_prospect_events e where e.prospect_id = p.id
    and e.event_type in ('meeting_scheduled', 'meeting_held', 'meeting_cancelled')
  order by e.occurred_at desc, e.recorded_at desc, e.id desc limit 1
) meeting on true
left join lateral (
  select steps.title, steps.due_date from (
    select op.next_action as title, op.next_action_date as due_date, op.id
      from public.opportunities op where op.lead_id = p.lead_id
      and nullif(btrim(op.next_action), '') is not null and op.next_action_date is not null
      and op.stage not in ('ganado', 'perdido', 'no_califica')
    union all
    select a.body as title, a.due_date, a.id from public.activities a
      join public.opportunities op on op.id = a.opportunity_id
      where op.lead_id = p.lead_id and a.type = 'tarea' and not a.completed and a.due_date is not null
      and op.stage not in ('ganado', 'perdido', 'no_califica')
      and nullif(btrim(a.body), '') is not null
  ) steps order by steps.due_date, steps.id limit 1
) next_step on true;

revoke all on public.reservas_sales_projection from public, anon;
grant select on public.reservas_sales_projection to authenticated;

create or replace function public.get_reservas_sales_panel(
  p_page integer default 1, p_search text default '', p_stage text default '', p_attention text default ''
) returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_result jsonb;
begin
  if not public.is_internal_member() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_page < 1 or p_page > 100000 then raise exception 'invalid page'; end if;
  with all_rows as materialized (select * from public.reservas_sales_projection),
  filtered as (select * from all_rows r
    where (coalesce(p_search, '') = '' or strpos(lower(r.organization_name || ' ' || r.phone_e164), lower(p_search)) > 0)
      and (coalesce(p_stage, '') = '' or r.stage = p_stage)
      and (coalesce(p_attention, '') = ''
        or (p_attention = 'pending' and r.pending_response)
        or (p_attention = 'overdue' and r.follow_up_overdue)
        or (p_attention = 'meeting' and r.meeting_soon)
        or (p_attention = 'suppressed' and r.do_not_contact)))
  select jsonb_build_object(
    'generated_at', now(), 'page', p_page, 'page_size', 50,
    'filtered_count', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select * from filtered order by created_at desc, id limit 50 offset (p_page - 1) * 50
    ) r), '[]'::jsonb),
    'metrics', (select jsonb_build_object(
      'imported', count(*), 'contacted', count(*) filter (where first_outbound_at is not null),
      'responded', count(*) filter (where responded),
      'scheduled', count(*) filter (where meeting_scheduled), 'held', count(*) filter (where meeting_held),
      'proposed', count(*) filter (where proposal_sent), 'won', count(*) filter (where stage = 'won'),
      'lost', count(*) filter (where stage = 'lost'), 'suppressed', count(*) filter (where do_not_contact),
      'scheduled_from_replies', count(*) filter (where meeting_scheduled and responded),
      'held_from_scheduled', count(*) filter (where meeting_held and meeting_scheduled),
      'proposed_from_held', count(*) filter (where proposal_sent and meeting_held),
      'won_from_proposed', count(*) filter (where stage = 'won' and proposal_sent),
      'pending', count(*) filter (where pending_response),
      'overdue', count(*) filter (where follow_up_overdue), 'meeting_soon', count(*) filter (where meeting_soon)
    ) from all_rows)) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_reservas_sales_panel(integer, text, text, text) from public;
grant execute on function public.get_reservas_sales_panel(integer, text, text, text) to authenticated;

create or replace function public.get_reservas_sales_export_page(p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_result jsonb;
begin
  if not public.is_internal_member() then raise exception 'not authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object(
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at, e.recorded_at, e.id)
      from public.reservas_prospect_events e where e.prospect_id = r.id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'conversation_id', c.id, 'zernio_conversation_id', c.zernio_conversation_id,
      'zernio_message_id', m.zernio_message_id, 'direction', m.direction, 'body', m.body,
      'attachments', m.attachments, 'sent_at', m.sent_at, 'sent_by', m.sent_by,
      'delivery_status', m.delivery_status, 'deleted_at', m.deleted_at
    ) order by m.sent_at, m.id) from public.social_conversations c
      join public.social_messages m on m.conversation_id = c.id
      where c.lead_id = r.lead_id and c.platform = 'whatsapp'), '[]'::jsonb)
  ) order by r.id), '[]'::jsonb) into v_result from (
    select * from public.reservas_sales_projection where p_after is null or id > p_after order by id limit 100
  ) r;
  return v_result;
end;
$$;
revoke all on function public.get_reservas_sales_export_page(uuid) from public;
grant execute on function public.get_reservas_sales_export_page(uuid) to authenticated;
