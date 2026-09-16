-- ============================================================
-- Bandeja externa — conversaciones de WhatsApp e Instagram (CRM 2.0, Fase 1)
--
-- No se reutiliza `conversations` (0010) a propósito, por la misma razón que
-- 0013 tampoco la reutilizó: esa tabla modela hilos internos y exige un
-- `created_by` que sea un perfil del equipo, participantes que sean perfiles y
-- un contexto exclusivo. Un DM de alguien que todavía no es nadie en el CRM no
-- cumple ninguna de las tres. Separadas en la base, juntas en la pantalla.
--
-- El flujo es de una sola dirección para entrar:
--   Zernio --webhook--> /api/zernio/webhook --RPC--> estas tablas --> UI
-- y de una sola dirección para salir:
--   UI --server action--> POST a Zernio --> se guarda el saliente
--
-- Aditiva. No toca migraciones históricas ni tablas existentes.
-- ============================================================

-- ------------------------------------------------------------
-- Secreto del webhook
-- ------------------------------------------------------------
-- Va en `ingest_config`, que ya existe desde 0004 y no tiene NINGUNA política
-- RLS: ni `anon` ni `authenticated` pueden leerla por la API. Sólo las
-- funciones SECURITY DEFINER la ven.
alter table public.ingest_config
  add column if not exists zernio_webhook_secret text;

comment on column public.ingest_config.zernio_webhook_secret is
  'Mismo valor que ZERNIO_WEBHOOK_SECRET en el entorno. Debe coincidir o el webhook rechaza todo.';

-- ------------------------------------------------------------
-- Conversaciones
-- ------------------------------------------------------------
create table public.social_conversations (
  id                      uuid primary key default gen_random_uuid(),
  zernio_conversation_id  text not null unique
    check (length(btrim(zernio_conversation_id)) between 1 and 128),
  social_account_id       uuid not null
    references public.social_accounts(id) on delete cascade,
  platform                text not null
    check (platform in ('whatsapp','instagram','facebook','telegram','other')),

  -- La contraparte. Es gente que todavía no existe en el CRM: se guarda lo que
  -- manda la plataforma, sin obligar a crear un contacto para poder chatear.
  participant_external_id text,
  participant_name        text,
  participant_handle      text,
  participant_avatar_url  text,

  status                  text not null default 'open'
    check (status in ('open','resolved','archived')),
  assigned_to             uuid references public.profiles(id),

  last_message_at         timestamptz,
  last_message_preview    text,
  /**
   * Último mensaje ENTRANTE. De acá sale la ventana de 24h de WhatsApp: pasada
   * esa hora sólo se puede responder con plantilla aprobada. Se guarda el
   * instante y no el vencimiento para que no quede desfasado si cambia la regla.
   */
  last_inbound_at         timestamptz,

  /**
   * Sin leer para EL EQUIPO, no para cada persona.
   *
   * La Bandeja interna (0010) lleva lectura por persona porque ahí importa si
   * te mencionaron a vos. Acá importa otra cosa: si un cliente escribió y
   * todavía nadie contestó. Si Tomi ya respondió, el chat está atendido
   * también para Santiago.
   */
  unread_count            integer not null default 0 check (unread_count >= 0),
  last_read_at            timestamptz,
  last_read_by            uuid references public.profiles(id),

  -- Lo que un CRM aporta por encima de la app de WhatsApp: el hilo enlazado a
  -- la ficha comercial. Los tres quedan en null hasta que alguien los vincule.
  lead_id                 uuid references public.leads(id) on delete set null,
  client_id               uuid references public.clients(id) on delete set null,
  opportunity_id          uuid references public.opportunities(id) on delete set null,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- La Bandeja ordena por actividad reciente: es el índice que se usa siempre.
create index social_conversations_recent_idx
  on public.social_conversations (last_message_at desc nulls last);

-- Filtro por canal dentro del mismo panel (Todos / WhatsApp / Instagram).
create index social_conversations_open_idx
  on public.social_conversations (platform, last_message_at desc)
  where status = 'open';

-- "Qué está esperando respuesta", que es la pregunta del dashboard.
create index social_conversations_unread_idx
  on public.social_conversations (last_message_at desc)
  where unread_count > 0;

create index social_conversations_lead_idx
  on public.social_conversations (lead_id)
  where lead_id is not null;

-- ------------------------------------------------------------
-- Mensajes
-- ------------------------------------------------------------
create table public.social_messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null
    references public.social_conversations(id) on delete cascade,
  /**
   * Id del mensaje en Zernio. Único, y es lo que hace idempotente todo:
   * un saliente lo inserta la app al enviarlo y después llega el webhook
   * `message.sent` con el mismo id, que actualiza en vez de duplicar.
   */
  zernio_message_id text unique
    check (zernio_message_id is null or length(btrim(zernio_message_id)) between 1 and 128),
  direction         text not null check (direction in ('inbound','outbound')),
  body              text,
  attachments       jsonb,
  delivery_status   text not null default 'sent'
    check (delivery_status in ('pending','sent','delivered','read','failed')),
  -- Código y motivo que devuelve la plataforma. Poblado sólo en 'failed'.
  error             jsonb,
  -- Quién lo mandó desde el CRM. Null en los entrantes y en los que se
  -- enviaron desde el celular (WhatsApp Coexistence los reporta igual).
  sent_by           uuid references public.profiles(id),
  sent_at           timestamptz not null default now(),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),

  -- Un mensaje sin texto y sin adjuntos no es un mensaje.
  constraint social_messages_has_content
    check (body is not null or attachments is not null)
);

create index social_messages_thread_idx
  on public.social_messages (conversation_id, sent_at);

-- ------------------------------------------------------------
-- Autorización
-- ------------------------------------------------------------
alter table public.social_conversations enable row level security;
alter table public.social_messages      enable row level security;

-- Las conversaciones las crea el webhook, nunca la app: un hilo existe porque
-- alguien escribió, no porque alguien apretó un botón. Por eso no hay INSERT.
create policy "social_conversations_member_read" on public.social_conversations
  for select to authenticated
  using (public.is_internal_member());

-- Sí se pueden editar: asignar, resolver, marcar leído y enlazar a un lead.
create policy "social_conversations_member_update" on public.social_conversations
  for update to authenticated
  using (public.is_internal_member())
  with check (public.is_internal_member());

create policy "social_messages_member_read" on public.social_messages
  for select to authenticated
  using (public.is_internal_member());

/**
 * Un miembro sólo puede insertar mensajes SALIENTES.
 *
 * Los entrantes son un hecho del mundo: los reporta la plataforma y entran por
 * el webhook. Si la app pudiera insertarlos, el historial de lo que dijo un
 * cliente dejaría de ser evidencia y pasaría a ser algo editable.
 */
create policy "social_messages_member_insert_outbound" on public.social_messages
  for insert to authenticated
  with check (public.is_internal_member() and direction = 'outbound');

-- Sin UPDATE ni DELETE: un mensaje enviado no se reescribe. El estado de
-- entrega lo actualiza el webhook, que pasa por SECURITY DEFINER.

-- ------------------------------------------------------------
-- Ingesta del webhook
-- ------------------------------------------------------------
/**
 * Escribe un evento de Zernio de forma atómica e idempotente.
 *
 * Por qué existe en vez de escribir desde el route handler:
 *
 *  - El handler usa la clave `anon`, que es PÚBLICA (viaja en el bundle del
 *    navegador). Si esta función no validara un secreto, cualquiera que copie
 *    esa clave del HTML podría inyectar mensajes falsos en la Bandeja.
 *  - La alternativa sería usar la service_role key en la app, pero esa clave
 *    saltea RLS en TODAS las tablas. Este repo la mantiene fuera de `src/` a
 *    propósito, y no es esta función la que amerita cambiar ese criterio.
 *
 * La firma HMAC del webhook ya se verificó en el handler. Este secreto protege
 * un camino distinto: la llamada directa al RPC por PostgREST.
 *
 * `p_conversation` y `p_message` llegan ya normalizados desde TypeScript
 * (`src/lib/zernio/events.ts`), que es donde se prueba el parseo de cada форма
 * de evento sin necesidad de una base.
 */
create or replace function public.ingest_social_event(
  p_secret              text,
  p_event_id            text,
  p_event_type          text,
  p_payload             jsonb,
  p_account_external_id text,
  p_conversation        jsonb,
  p_message             jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret          text;
  v_event_rows      integer;
  v_account_id      uuid;
  v_conversation_id uuid;
  v_message_id      text;
  v_direction       text;
  v_body            text;
  v_status          text;
  v_sent_at         timestamptz;
  v_existing        uuid;
begin
  select zernio_webhook_secret into v_secret from ingest_config where id = 1;
  if v_secret is null or p_secret is distinct from v_secret then
    return jsonb_build_object('status', 'unauthorized');
  end if;

  -- Deduplicación: el índice único es el mecanismo. Zernio entrega
  -- at-least-once, así que el mismo evento puede llegar hasta 7 veces.
  insert into social_webhook_events (zernio_event_id, event_type, payload)
  values (p_event_id, p_event_type, p_payload)
  on conflict (zernio_event_id) do nothing;

  get diagnostics v_event_rows = row_count;
  if v_event_rows = 0 then
    return jsonb_build_object('status', 'duplicate');
  end if;

  -- Sin cuenta conocida no se puede colgar la conversación de ningún lado.
  -- Se marca el evento y se sigue: no es un error, es una cuenta sin sincronizar.
  select id into v_account_id
  from social_accounts
  where zernio_account_id = p_account_external_id;

  if v_account_id is null then
    update social_webhook_events
    set status = 'ignored',
        processed_at = now(),
        error_message = 'Cuenta desconocida: sincronizá las cuentas de Zernio.'
    where zernio_event_id = p_event_id;
    return jsonb_build_object('status', 'ignored', 'reason', 'unknown_account');
  end if;

  -- ---------- Conversación ----------
  insert into social_conversations (
    zernio_conversation_id, social_account_id, platform,
    participant_external_id, participant_name, participant_handle,
    participant_avatar_url
  )
  values (
    p_conversation->>'externalId',
    v_account_id,
    coalesce(p_conversation->>'platform', 'other'),
    p_conversation->>'participantExternalId',
    p_conversation->>'participantName',
    p_conversation->>'participantHandle',
    p_conversation->>'participantAvatarUrl'
  )
  on conflict (zernio_conversation_id) do update
    set participant_name       = coalesce(excluded.participant_name,
                                          social_conversations.participant_name),
        participant_handle     = coalesce(excluded.participant_handle,
                                          social_conversations.participant_handle),
        participant_avatar_url = coalesce(excluded.participant_avatar_url,
                                          social_conversations.participant_avatar_url),
        updated_at             = now()
  returning id into v_conversation_id;

  -- ---------- Mensaje ----------
  if p_message is not null and p_message <> 'null'::jsonb then
    v_message_id := p_message->>'externalId';
    v_direction  := coalesce(p_message->>'direction', 'inbound');
    v_body       := p_message->>'body';
    v_status     := coalesce(p_message->>'deliveryStatus', 'sent');
    v_sent_at    := coalesce((p_message->>'sentAt')::timestamptz, now());

    select id into v_existing
    from social_messages
    where zernio_message_id = v_message_id and v_message_id is not null;

    if v_existing is not null then
      -- Ya estaba: es un acuse de entrega, o el eco del saliente que la app
      -- insertó al enviarlo. Sólo avanza el estado, nunca reescribe el texto.
      update social_messages
      set delivery_status = v_status,
          error           = coalesce(p_message->'error', error),
          deleted_at      = case
                              when p_message->>'deletedAt' is not null
                              then (p_message->>'deletedAt')::timestamptz
                              else deleted_at
                            end
      where id = v_existing;
    elsif v_body is not null or p_message->'attachments' is not null then
      insert into social_messages (
        conversation_id, zernio_message_id, direction, body,
        attachments, delivery_status, error, sent_at
      )
      values (
        v_conversation_id, v_message_id, v_direction, v_body,
        p_message->'attachments', v_status, p_message->'error', v_sent_at
      );

      update social_conversations
      set last_message_at      = greatest(coalesce(last_message_at, v_sent_at), v_sent_at),
          last_message_preview = left(coalesce(v_body, '[adjunto]'), 180),
          last_inbound_at      = case when v_direction = 'inbound'
                                      then v_sent_at else last_inbound_at end,
          unread_count         = case when v_direction = 'inbound'
                                      then unread_count + 1 else unread_count end,
          -- Un mensaje nuevo reabre un hilo que alguien había dado por cerrado.
          status               = case when status = 'resolved' and v_direction = 'inbound'
                                      then 'open' else status end,
          updated_at           = now()
      where id = v_conversation_id;
    end if;
  end if;

  update social_webhook_events
  set status = 'processed', processed_at = now()
  where zernio_event_id = p_event_id;

  return jsonb_build_object(
    'status', 'processed',
    'conversationId', v_conversation_id
  );

exception when others then
  -- Nunca se le devuelve `sqlerrm` a quien llama: puede contener nombres de
  -- columnas y datos de otras filas. Se guarda del lado de adentro.
  insert into ingest_errors (payload, error)
  values (p_payload, 'ingest_social_event: ' || sqlerrm);

  update social_webhook_events
  set status = 'failed', processed_at = now(), error_message = 'Error interno al procesar.'
  where zernio_event_id = p_event_id;

  return jsonb_build_object('status', 'error');
end;
$$;

-- El route handler llama con la clave anon y sin sesión, así que `anon`
-- necesita EXECUTE. El secreto de adentro es lo que hace que eso sea seguro.
revoke execute on function public.ingest_social_event(
  text, text, text, jsonb, text, jsonb, jsonb
) from public;
grant execute on function public.ingest_social_event(
  text, text, text, jsonb, text, jsonb, jsonb
) to anon, authenticated;

-- ------------------------------------------------------------
-- updated_at automático
-- ------------------------------------------------------------
drop trigger if exists social_conversations_set_updated_at on public.social_conversations;
create trigger social_conversations_set_updated_at
  before update on public.social_conversations
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
