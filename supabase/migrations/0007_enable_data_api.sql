-- ============================================================
-- Expone el esquema público a PostgREST para el CRM.
--
-- Los proyectos Supabase nuevos pueden iniciar con la Data API privada.
-- Este CRM usa supabase-js contra tablas de public y mantiene RLS activo en
-- todas las tablas internas, por lo que public debe ser un esquema expuesto.
-- La configuración es reversible con:
--   alter role authenticator reset pgrst.db_schemas;
--   alter role authenticator reset pgrst.db_extra_search_path;
-- ============================================================

alter role authenticator set pgrst.db_schemas = 'public, storage, graphql_public';
alter role authenticator set pgrst.db_extra_search_path = 'public, extensions';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
