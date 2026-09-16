-- ============================================================
-- Ids externos más largos (CRM 2.0)
--
-- Las migraciones 0014 a 0016 limitaron a 128 caracteres todas las columnas
-- que guardan ids de Zernio. Los ids de mensaje de Instagram miden 164: Meta
-- codifica adentro la cuenta, el hilo y el mensaje. Cada mensaje de Instagram
-- rompía el check, el RPC atajaba el error y deshacía la llamada entera —
-- conversación incluida—, así que ningún chat de Instagram llegaba a la Bandeja,
-- ni del historial ni en vivo por webhook.
--
-- Los de WhatsApp miden 74 y pasaban. El tope se sube en TODAS las columnas de
-- ids externos, no sólo en la que falló: el largo lo decide Meta, no nosotros,
-- y no hay forma de saber de antemano cuál va a crecer después.
--
-- 512 sigue siendo un tope: lo que se quiere evitar es basura sin límite, no
-- ids legítimos.
-- ============================================================

-- Los checks originales se crearon en línea, sin nombre explícito. En vez de
-- adivinar el nombre autogenerado, se buscan por su definición.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tabla, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in (
        'public.social_accounts'::regclass,
        'public.social_webhook_events'::regclass,
        'public.social_conversations'::regclass,
        'public.social_messages'::regclass,
        'public.social_posts'::regclass,
        'public.social_stories'::regclass
      )
      and pg_get_constraintdef(c.oid) ilike '%length(btrim(zernio_%'
  loop
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
  end loop;
end $$;

alter table public.social_accounts
  add constraint social_accounts_zernio_account_id_len
    check (length(btrim(zernio_account_id)) between 1 and 512),
  add constraint social_accounts_zernio_profile_id_len
    check (zernio_profile_id is null or length(btrim(zernio_profile_id)) between 1 and 512);

alter table public.social_webhook_events
  -- Los ids de importación son "backfill:" + el id del mensaje, así que este
  -- tiene que admitir el largo de un id de mensaje más el prefijo.
  add constraint social_webhook_events_zernio_event_id_len
    check (length(btrim(zernio_event_id)) between 1 and 600);

alter table public.social_conversations
  add constraint social_conversations_zernio_conversation_id_len
    check (length(btrim(zernio_conversation_id)) between 1 and 512);

alter table public.social_messages
  add constraint social_messages_zernio_message_id_len
    check (zernio_message_id is null or length(btrim(zernio_message_id)) between 1 and 512);

alter table public.social_posts
  add constraint social_posts_zernio_post_id_len
    check (length(btrim(zernio_post_id)) between 1 and 512);

alter table public.social_stories
  add constraint social_stories_zernio_story_id_len
    check (length(btrim(zernio_story_id)) between 1 and 512);

notify pgrst, 'reload schema';
