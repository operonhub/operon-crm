-- ============================================================
-- Endurecimiento de autorización (RLS) — Paso 2: tablas del núcleo
--
-- Continúa 0011. Reemplaza la política `internal_all` (USING true /
-- WITH CHECK true) por membresía real y cierra el borrado en las tablas
-- que la aplicación nunca borra.
--
-- Aditiva: no toca datos, columnas ni migraciones históricas.
-- ============================================================

-- ------------------------------------------------------------
-- Tablas del núcleo: exigir membresía real y quitar DELETE
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
-- ingest_errors: sólo lectura para el equipo
-- ------------------------------------------------------------
-- Las filas las escribe `ingest_lead` (SECURITY DEFINER), que no pasa por RLS.
drop policy if exists "internal_all" on public.ingest_errors;

create policy "ingest_errors_member_read" on public.ingest_errors
  for select to authenticated
  using (public.is_internal_member());
