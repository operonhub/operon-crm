-- ============================================================
-- Endurecimiento de autorización (RLS)
--
-- Las tablas del núcleo (0001) quedaron con la política `internal_all`
-- definida como USING (true) WITH CHECK (true). Eso no verifica siquiera que
-- quien consulta pertenezca al equipo, y habilita UPDATE y DELETE sobre todo.
-- Consecuencias reales verificadas en `src/lib/rls/policies.test.ts`:
--   · un operador podía ascenderse a admin y degradar a un admin;
--   · cualquiera podía borrar perfiles y proyectos;
--   · una cuenta autenticada sin perfil tenía acceso completo.
--
-- Esta migración es aditiva: reemplaza políticas, no toca datos ni columnas.
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles: la tabla que sostiene todo el modelo de permisos
-- ------------------------------------------------------------
drop policy if exists "internal_all" on public.profiles;

create policy "profiles_member_read" on public.profiles
  for select to authenticated
  using (public.is_internal_member());

-- Cada quien edita su propio perfil; un admin puede editar cualquiera.
-- El cambio de `role` lo controla el trigger de abajo, porque una política
-- de RLS no puede comparar el valor anterior contra el nuevo.
create policy "profiles_self_or_admin_update" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_internal_admin())
  with check (id = auth.uid() or public.is_internal_admin());

-- Sin política de INSERT: los perfiles los crea `handle_new_user`, que es
-- SECURITY DEFINER y por lo tanto no pasa por RLS.
-- Sin política de DELETE: los perfiles no se borran desde la aplicación.

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'No se puede cambiar el identificador de un perfil'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    if not public.is_internal_admin() then
      raise exception 'Solo un administrador puede cambiar el rol de un perfil'
        using errcode = '42501';
    end if;

    -- Evita que el equipo quede sin ningún administrador.
    if old.role = 'admin' and new.role <> 'admin'
       and (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'No se puede quitar el último administrador'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_role_escalation() from public, anon, authenticated;

create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- ------------------------------------------------------------
-- 2. Tablas del núcleo: exigir membresía real y quitar DELETE
-- ------------------------------------------------------------
-- Lectura, alta y edición para miembros internos. El borrado queda cerrado:
-- la aplicación nunca borra estos registros (verificado sobre el código).
do $$
declare t text;
begin
  foreach t in array array['organizations','contacts','campaigns','leads',
                           'opportunities','clients','projects','project_tasks',
                           'activities','automations'] loop
    execute format('drop policy if exists "internal_all" on public.%I;', t);

    execute format($p$create policy "%1$s_member_read" on public.%1$I
                     for select to authenticated
                     using (public.is_internal_member());$p$, t);

    execute format($p$create policy "%1$s_member_insert" on public.%1$I
                     for insert to authenticated
                     with check (public.is_internal_member());$p$, t);

    execute format($p$create policy "%1$s_member_update" on public.%1$I
                     for update to authenticated
                     using (public.is_internal_member())
                     with check (public.is_internal_member());$p$, t);
  end loop;
end $$;

-- Único borrado que la aplicación realiza sobre estas tablas: quitar un
-- contacto de una organización.
create policy "contacts_member_delete" on public.contacts
  for delete to authenticated
  using (public.is_internal_member());

-- ------------------------------------------------------------
-- 3. ingest_errors: sólo lectura para el equipo
-- ------------------------------------------------------------
-- Las filas las escribe `ingest_lead` (SECURITY DEFINER), que no pasa por RLS.
drop policy if exists "internal_all" on public.ingest_errors;

create policy "ingest_errors_member_read" on public.ingest_errors
  for select to authenticated
  using (public.is_internal_member());
