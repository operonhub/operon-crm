# Rollback del endurecimiento de RLS (migraciones 0011 y 0012)

Cómo volver atrás si algo se comporta distinto después de aplicar el
endurecimiento de políticas. Se ejecuta en el **SQL Editor de Supabase**.

Ninguna de las dos migraciones toca datos, columnas ni tablas: sólo
políticas y un trigger. El rollback restaura el estado anterior exacto.

> Antes de revertir, conviene anotar qué falló. Volver al estado previo
> reabre la escalada de privilegios que 0011 cierra.

## Revertir el paso 2 (0012 — tablas del núcleo)

```sql
do $$
declare t text;
begin
  foreach t in array array['organizations','contacts','campaigns','leads',
                           'opportunities','clients','projects','project_tasks',
                           'activities','automations','ingest_errors'] loop
    execute format('drop policy if exists "%1$s_member_read" on public.%1$I;', t);
    execute format('drop policy if exists "%1$s_member_insert" on public.%1$I;', t);
    execute format('drop policy if exists "%1$s_member_update" on public.%1$I;', t);
    execute format($p$create policy "internal_all" on public.%1$I
                     for all to authenticated using (true) with check (true);$p$, t);
  end loop;
end $$;

drop policy if exists "contacts_member_delete" on public.contacts;
```

## Revertir el paso 1 (0011 — profiles)

```sql
drop trigger if exists profiles_prevent_role_escalation on public.profiles;
drop function if exists public.prevent_role_escalation();

drop policy if exists "profiles_member_read" on public.profiles;
drop policy if exists "profiles_self_or_admin_update" on public.profiles;

create policy "internal_all" on public.profiles
  for all to authenticated using (true) with check (true);
```

## Verificar que el rollback quedó aplicado

```sql
select tablename, policyname, cmd
from pg_policies where schemaname='public' and tablename='profiles';
```

Debe aparecer una sola fila: `internal_all` / `ALL`.

## Cambiar roles después de aplicar 0011

El trigger exige que quien cambia un `role` sea admin, y lo determina con
`auth.uid()`. En el SQL Editor de Supabase **no hay usuario autenticado**, así
que un `update` directo sobre `role` va a fallar — es intencional.

Para un cambio legítimo de rol desde el SQL Editor:

```sql
begin;
set local session_replication_role = replica;  -- suspende triggers en esta sesión
update public.profiles set role = 'admin' where email = 'persona@operon.dev';
commit;
```

El `set local` sólo afecta a esa transacción; no desactiva la protección para
la aplicación ni para nadie más.
