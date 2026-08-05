-- Endurecimiento: fijar search_path y quitar EXECUTE público de la función trigger.
alter function public.set_updated_at() set search_path = '';
alter function public.set_created_by() set search_path = '';

-- handle_new_user es un trigger SECURITY DEFINER: no debe ser invocable vía RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
