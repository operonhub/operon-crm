-- ============================================================
-- Endurecimiento de autorización (RLS) — Paso 1: profiles
--
-- Las tablas del núcleo (0001) quedaron con la política `internal_all`
-- definida como USING (true) WITH CHECK (true). Eso no verifica siquiera que
-- quien consulta pertenezca al equipo, y habilita UPDATE y DELETE sobre todo.
-- Consecuencias reales verificadas en `src/lib/rls/policies.test.ts`:
--   · un operador podía ascenderse a admin y degradar a un admin;
--   · cualquiera podía borrar perfiles y proyectos;
--   · una cuenta autenticada sin perfil tenía acceso completo.
--
-- Paso 1 de 2: blinda `profiles`, que es la tabla sobre la que se apoya todo
-- el modelo de permisos. El endurecimiento del resto va en 0012.
--
-- Esta migración es aditiva: reemplaza políticas, no toca datos ni columnas.
-- ============================================================

-- ------------------------------------------------------------
-- profiles: la tabla que sostiene todo el modelo de permisos
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
