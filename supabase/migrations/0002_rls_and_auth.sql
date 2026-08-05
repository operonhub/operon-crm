-- ============================================================
-- RLS: solo miembros internos autenticados acceden a los datos.
-- anon (no autenticado) no ve absolutamente nada.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['profiles','organizations','contacts','campaigns','leads',
                           'opportunities','clients','projects','project_tasks',
                           'automations','activities','audit_log'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$create policy "internal_all" on public.%I
                     for all to authenticated using (true) with check (true);$p$, t);
  end loop;
end $$;

-- ============================================================
-- Auto-creación de profile al registrarse un usuario en auth.users
-- ============================================================
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'operador')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
