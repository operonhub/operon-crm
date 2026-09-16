# Operon CRM 2.0 — Plan de trabajo

> Estado: **propuesta, sin implementar**. Escrito el 2026-09-15 sobre `master` @ `aa4306a`.

## Contexto

El CRM hoy cubre el ciclo comercial completo (lead → oportunidad → cliente → proyecto → cobro)
y tiene una Bandeja de colaboración **interna** entre Santiago y Tomi. Lo que no tiene es el
canal por donde realmente entran los clientes: WhatsApp e Instagram. Hoy esa conversación vive
en el celular, desconectada del CRM, y el CRM se entera cuando alguien la transcribe a mano.

La v2.0 cierra esa brecha con tres módulos nuevos, más una integración:

1. **Bandeja unificada** — los DMs de WhatsApp e Instagram entran al mismo panel que ya se usa
   para el equipo, y un DM se puede convertir en lead sin salir de la pantalla.
2. **Redes sociales** — qué se publicó, cómo rindió, y si el ritmo de publicación se sostiene.
3. **Workflows** — panel de control real de las automatizaciones de n8n (hoy `automations` solo
   guarda un link).

El proveedor de los dos primeros es **Zernio** (`https://zernio.com/api/v1`), un agregador que
expone WhatsApp e Instagram detrás de una sola API. El tercero habla directo con la API pública
de la instancia de n8n.

### Decisiones ya tomadas (2026-09-15)

| Decisión | Elegido |
|---|---|
| Alcance de Redes sociales | Solo cuentas de Operon (un único profile de Zernio) |
| Contenido | Solo lectura + analíticas. No se publica ni se programa desde el CRM |
| Workflows | Contra la API real de la instancia de n8n |
| Estado de Zernio | Sin conectar todavía — el flujo de conexión es parte del trabajo |
| WhatsApp | **Coexistence**: el número sigue funcionando en la app del celular y en la API a la vez. Techo de 20 mensajes/segundo y sin API de grupos ni llamadas — irrelevante para el volumen de Operon |

---

## Principio rector: nada simulado

Este repo ya tomó una postura y la v2.0 la respeta. La Bandeja dice hoy, textualmente, *"este CRM
todavía no conecta WhatsApp, Instagram ni email… hoy no mostramos canales simulados"*. El módulo
de IA hace lo mismo: `readHermesConfig()` (`src/lib/assistant/config.ts:24-35`) devuelve
`{ configured: false, reason }` y la UI lo dice en castellano en vez de inventar una respuesta.

Toda integración nueva sigue ese patrón: `readZernioConfig()` / `readN8nConfig()` devuelven un
estado honesto, y cada sección muestra **por qué** está vacía (falta la key, falta conectar la
cuenta, falta el add-on) en lugar de un gráfico con datos de mentira.

---

## Arquitectura: espejo, no proxy

La doc de Zernio es explícita para dashboards: *"Dashboard renders never call Zernio"*. Las
analíticas comparten un presupuesto de 6–20 req/**segundo** para toda la cuenta, y las métricas
de plataforma llegan con ~24h de retraso igual. Por eso:

```
Zernio ──webhook (tiempo real)──▶ /api/zernio/webhook ──▶ Supabase ──▶ UI
       ──cron (contenido/métricas)──▶ /api/cron/zernio/* ──▶ Supabase ──▶ UI
       ◀──envío de mensajes (server action, on-demand)──
```

La UI **siempre** lee de Supabase. Zernio se llama solo desde el webhook, desde los crons y
cuando se manda un mensaje. Esto además hace que todo el módulo funcione con RLS, búsqueda SQL y
joins contra `leads`/`clients` — que es lo que un CRM aporta por encima de la app de WhatsApp.

### Límites reales que condicionan el diseño

| Límite | Consecuencia en el plan |
|---|---|
| Las historias de IG solo existen 24h y Zernio **no** guarda histórico | Cron cada 3h que fotografía historias + métricas antes de que expiren. El histórico lo construimos nosotros, desde cero, desde el día 1 |
| El sync de posts externos **no cubre historias** | Las historias van por `GET /v1/accounts/{id}/instagram/stories`, aparte del resto |
| Backfill completo de posts al conectar la cuenta (evento `post.external.created`) | Los reels ya publicados aparecen solos. No hay que cargar nada a mano |
| Un profile de Zernio = **un** account por plataforma | Un solo profile "Operon" alcanza. Si mañana se suman clientes, cada uno es su profile |
| Webhooks: entrega *at-least-once*, hasta 7 reintentos, hay que responder 2xx en **5 s** | El endpoint solo valida, deduplica e inserta. Cero trabajo pesado en el request |
| Rate limit por API key, con `Retry-After` en los 429 | El cliente HTTP respeta `Retry-After` y los crons corren con concurrencia acotada |
| La ventana de 24h de WhatsApp | Fuera de esa ventana solo se puede responder con plantilla aprobada. La UI tiene que avisarlo **antes** de que se escriba el mensaje, no después del error |

---

## Modelo de datos

Tablas nuevas, no reutilizamos `conversations` (la de 0010). Esa tabla modela hilos **internos**:
sus participantes son `profiles`, `created_by` es obligatorio y tiene un check de exclusividad
sobre el contexto. Un DM de un desconocido de Instagram no encaja ahí sin romperla. Separadas, cada
una tiene sus propias políticas y la Bandeja las muestra juntas en la UI.

### `0014_zernio_foundation.sql`
- `social_accounts` — espejo de `GET /v1/accounts`: `zernio_account_id` (único), `platform`,
  `username`, `display_name`, `profile_url`, `is_active`, `last_synced_at`.
  Sin secretos: la API key vive en env, nunca en la base (mismo criterio que `automations.secret_ref`).
- `social_webhook_events` — `zernio_event_id` con **índice único**. Es la mesa de deduplicación:
  se inserta primero, y si choca, el evento ya se procesó y se descarta.
- `social_sync_state` — cursor y `last_run_at` por tipo de sync, para que un cron que falla retome.

### `0015_social_inbox.sql`
- `social_conversations` — `zernio_conversation_id`, `social_account_id`, `platform`,
  `participant_name/handle/avatar_url`, `last_message_at`, `last_message_preview`, `unread_count`,
  `status`, `window_expires_at` (la ventana de 24h de WhatsApp), y los enlaces al CRM:
  `lead_id`, `client_id`, `opportunity_id`.
- `social_messages` — `zernio_message_id` único, `direction` (in/out), `body`, `attachments jsonb`,
  `delivery_status` (sent/delivered/read/failed), `error jsonb`, `sent_by` (qué perfil lo mandó).

### `0016_social_content.sql`
- `social_posts` — `zernio_post_id`, `platform_post_id`, `media_type` (reel/imagen/carrusel/video),
  `caption`, `thumbnail_url`, `permalink`, `published_at`.
- `social_post_metrics` — snapshot **diario** por post (`post_id`, `captured_on`, métricas).
  Snapshots y no un update en el lugar: es lo que permite decir *"este reel sumó 4.000 vistas esta
  semana"* en vez de solo un total acumulado.
- `social_stories` + `social_story_metrics` — misma idea, pero capturadas antes de que expiren.
- `social_follower_stats` — un punto por día por cuenta.

### `0017_workflows.sql`
- `automations` se extiende (no se reemplaza): `n8n_workflow_id`, `active`, `last_synced_at`.
  Ya está vinculada a proyectos y ya se usa en `/metricas`; se mantiene esa relación.
- `workflow_executions` — espejo de las ejecuciones de n8n: `n8n_execution_id` único, `status`,
  `started_at`, `stopped_at`, `error_message`.

**RLS en todas:** lectura para miembros con `is_internal_member()`, escritura solo admin con
`is_internal_admin()`, sin DELETE — exactamente el patrón de `0012_rls_core_tables.sql`. Las
escrituras del webhook y de los crons pasan por funciones `SECURITY DEFINER`, igual que
`ingest_lead`. Cada migración suma sus casos a `src/lib/rls/policies.test.ts` (PGlite, sin Docker).

---

## Fases

### Fase 0 — Cimientos ✅ HECHA (2026-09-15)

Entregado y verificado (`npm run test` 302 ✓, `lint` ✓, `build` ✓, `tsc --noEmit` ✓):

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/0014_zernio_foundation.sql` | `social_accounts`, `social_webhook_events`, `social_sync_state` + RLS |
| `src/lib/zernio/config.ts` | `readZernioConfig` / `readZernioWebhookConfig` / `maskApiKey` |
| `src/lib/zernio/signature.ts` | Verificación HMAC-SHA256 en tiempo constante |
| `src/lib/zernio/types.ts` | Normalización de cuentas (puro, testeable) |
| `src/lib/zernio/client.ts` | Cliente HTTP: errores traducidos, `Retry-After`, `Idempotency-Key` |
| `src/lib/rls/zernio-policies.test.ts` | 15 casos de políticas sobre PGlite |
| `src/app/(app)/ajustes/conexiones/` | Pantalla de estado + acción de sincronización |
| `src/components/settings/sync-accounts-button.tsx` | Único botón que sale a internet |
| `.env.example` | Variables de Zernio **y** las de Hermes, que faltaban |

**Pendiente de la fase 0:** aplicar `0014` a la base real. El MCP de Supabase sólo ve la
organización compartida (`nrpyusiuuchmdonjpkhd`); el proyecto del CRM vive en la cuenta personal
de Santiago, así que la migración se corre a mano desde el SQL Editor. Su SQL ya está validado:
`zernio-policies.test.ts` la ejecuta contra un Postgres real vía PGlite.

<details>
<summary>Detalle original de la fase</summary>

`src/lib/zernio/`:
- `config.ts` — `readZernioConfig()`, calcado de `src/lib/assistant/config.ts`.
- `client.ts` — wrapper de `fetch` con `Authorization: Bearer`, `Idempotency-Key` en los envíos,
  respeto de `Retry-After` en 429 y `fetch` inyectable para tests (patrón de
  `src/lib/assistant/provider.ts`).
- `signature.ts` — verificación HMAC-SHA256 del header `X-Zernio-Signature` contra el raw body,
  con comparación en tiempo constante.
- Migración `0014`. Variables nuevas en `.env.example`: `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`,
  `ZERNIO_PROFILE_ID`. **De paso:** documentar ahí `HERMES_API_URL`/`HERMES_API_KEY`, que hoy
  faltan en `.env.example`.
- Pantalla `/ajustes/conexiones` (solo admin): estado de cada integración y botón para
  sincronizar cuentas desde `GET /v1/accounts`. Es donde se ve, de un vistazo, qué falta conectar.

</details>

### Fase 1 — Bandeja con WhatsApp e Instagram ✅ HECHA (2026-09-15)

`npm run test` 347 ✓ · `lint` ✓ · `build` ✓ · `tsc --noEmit` ✓

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/0015_social_inbox.sql` | `social_conversations`, `social_messages`, RLS y el RPC `ingest_social_event` |
| `src/lib/zernio/events.ts` | Normalización de webhooks **y** de las respuestas REST (son formas distintas) |
| `src/app/api/zernio/webhook/route.ts` | Endpoint: firma HMAC, deduplicación, respuesta en menos de 5 s |
| `src/app/(app)/bandeja/social-actions.ts` | Responder, marcar leído, resolver, convertir en lead |
| `src/components/inbox/social-inbox.tsx` | Panel único con filtro Todos / WhatsApp / Instagram |
| `src/lib/rls/social-inbox.test.ts` | 19 casos del RPC y las políticas sobre Postgres real |

**Dos bugs encontrados y arreglados en el camino** (ninguno introducido por esta fase):

1. `src/lib/supabase/middleware.ts` sólo dejaba pasar `/api/ingest`, así que el webhook recibía
   un redirect a `/login`. Zernio lo habría seguido, habría obtenido un 200 con HTML y habría
   dado la entrega por buena: **todos los mensajes perdidos, sin un solo error registrado.**
   Detectado probando el endpoint por HTTP real, no por lectura de código.
2. `next.config.ts` fijaba `turbopack.root: process.cwd()`, que en Windows hacía que el build se
   escribiera en `<repo>/Desktop/Claude Code/<repo>/.next`. Ese directorio fantasma queda fuera
   del ignore de ESLint, así que `npm run lint` —que el README pide antes de entregar— reportaba
   miles de problemas falsos apenas alguien levantaba el dev server.

**Verificado por HTTP contra el endpoint real:** sin firma → 401, firma inválida → 401, firma de
otro cuerpo → 401, firma válida → llega hasta la base. Falta sólo aplicar `0015` y conectar una
cuenta para la prueba de punta a punta.

<details>
<summary>Detalle original de la fase</summary>

- Migración `0015`.
- `POST /api/zernio/webhook` — modelado sobre `src/app/api/ingest/leads/route.ts`: verifica firma,
  inserta en `social_webhook_events` (si choca el índice único, responde 200 y corta), delega en un
  RPC `SECURITY DEFINER`, responde en menos de 5 s. Eventos: `message.received`, `message.sent`,
  `conversation.started`, `message.delivered/read/failed`, `message.deleted`.
- Backfill inicial desde `GET /v1/inbox/conversations` (el historial pre-conexión **no** dispara
  webhooks, hay que traerlo a mano una vez).
- Server actions en `bandeja/actions.ts`: `sendSocialMessage`, `markSocialConversationRead`,
  `linkConversationToLead`. Mismo patrón `requireMember()` → validar → `writeAudit()` →
  `revalidatePath()` → `ActionResult`.
- **UI**: el tab "Clientes" de `inbox-workspace.tsx` (hoy el placeholder `FutureClientInbox`,
  líneas 646-654) pasa a ser real. Dentro del mismo panel, una fila de filtros
  `Todos | WhatsApp | Instagram` por URL (`?canal=whatsapp`), consistente con cómo ya funcionan
  `tab`/`status`/`assigned`. Cada fila lleva su badge de plataforma; el panel derecho es el mismo
  master-detail que ya existe.
- El diferencial del CRM: botón **"Convertir en lead"** sobre la conversación, que reusa
  `convert-dialog.tsx` y deja el hilo enlazado a la ficha.

</details>

#### Para poner la Fase 1 en marcha

1. Aplicar `0014` y `0015` a la base (SQL Editor de Supabase).
2. Cargar el secreto del webhook **en los dos lados**, y que coincidan:
   ```sql
   update ingest_config set zernio_webhook_secret = '<el mismo que ZERNIO_WEBHOOK_SECRET>' where id = 1;
   ```
3. Registrar el webhook en Zernio apuntando a `https://operon-crm-one.vercel.app/api/zernio/webhook`,
   con los eventos `message.received`, `message.sent`, `conversation.started`,
   `message.delivered`, `message.read`, `message.failed` y `message.deleted`.
4. Sincronizar las cuentas desde `/ajustes/conexiones` — sin cuenta conocida el RPC marca los
   eventos como `ignored` y no materializa nada.

### Fase 2 — Redes sociales
- Migración `0016`.
- Crons de Vercel: posts últimos 30 días cada hora, cola larga semanal, **historias cada 3h**,
  seguidores diario.
- `src/lib/social/metrics.ts` — lógica pura y testeable, siguiendo el precedente explícito de
  `src/lib/pipeline/funnel.ts` (*"pura y sin JSX… para que estas decisiones se prueben sin
  navegador"*): engagement rate, deltas entre snapshots, ritmo de publicación, ranking.
- `src/components/charts/` — SVG a mano (línea, barras, sparkline). **Sin librería nueva**: el repo
  no tiene ninguna y ya tiene los tokens `--chart-1`…`--chart-5` definidos en `globals.css` sin
  usar. Además evita 200 kB de JS para cuatro gráficos.
- Ruta `/redes`, con tabs por URL como en `agent-detail-workspace.tsx`:
  - **Contenido** → Reels y posts, grilla con miniatura, y Historias aparte (con su aviso de que el
    histórico arranca el día que se prendió el cron).
  - **Analíticas** → total de contenido del período, vistas, alcance, interacciones, engagement
    rate, evolución de seguidores, ritmo de publicación y **mejor rendimiento** rankeado por
    engagement rate (no por vistas brutas, que solo premia a lo más viejo).
  - **Cuentas** → estado de conexión y frescura del dato (`lastSync`), como recomienda la propia doc.

### Fase 3 — Workflows (n8n)
- Migración `0017`. `src/lib/n8n/client.ts` (header `X-N8N-API-KEY`, `GET /api/v1/workflows`,
  `GET /api/v1/executions`) + `readN8nConfig()`.
- Cron de sincronización + ruta `/workflows`: listado con filtros (patrón de `/agentes`) y detalle
  con tabs **Resumen / Ejecuciones / Errores**, calcado de `agent-detail-workspace.tsx` — que ya
  resuelve exactamente este problema (algo con estado, corridas y fallos).
- Acciones `activar`/`pausar` solo admin, auditadas.
- Las automatizaciones siguen colgando de proyectos, así que un workflow caído se ve desde la ficha
  del proyecto del cliente afectado.

### Fase 4 — Operon IA y entrega
- Nuevos contextos para el asistente: `messaging`, `social`, `workflow` en `CONTEXT_TYPES`
  (`src/lib/assistant/request.ts:14-23`), en `CONTEXT_SOURCES` (`service.ts:103-109`) y en el check
  de `assistant_conversations` (migración 0013). El asistente sigue siendo de solo lectura —
  las herramientas de escritura viven en Hermes y hoy no hay ninguna del CRM registrada.
- De paso quedan resueltos `finance`, `inbox` y `agent`, que están en el enum de contexto pero sin
  entrada en `CONTEXT_SOURCES` (o sea, hoy no resuelven ningún label).
- **Entregable final: `docs/handoff-hermes.md`** — el documento de traspaso para poder seguir
  trabajando desde Hermes con todo el contexto.

---

## Verificación

Cada fase cierra con lo que ya pide el README (`npm run test`, `npm run lint`, `npm run build`) más:

- **RLS**: casos nuevos en `src/lib/rls/policies.test.ts` — un `anon` no lee ni un mensaje; un
  operador lee pero no escribe configuración de cuentas.
- **Webhook**: test de firma (válida, inválida, body alterado) y de deduplicación (el mismo
  `event_id` dos veces deja una sola fila).
- **Cliente HTTP**: tests con `fetch` inyectado — 429 con `Retry-After`, 5xx, timeout — verificando
  que ningún cuerpo de error upstream se filtra a la UI (regla que ya aplica `stream.ts`).
- **Métricas**: tests puros de `social/metrics.ts` con snapshots fijos.
- **Manual**: `npm run dev` en el puerto 3020 (hay que volver a agregar la entrada `operon-crm` a
  `~/.claude/launch.json`, ya no está) y recorrer cada sección **sin** las claves configuradas,
  para confirmar que todas explican por qué están vacías en vez de romperse.

---

## Bloqueantes: lo que necesito de vos

1. **API key de Zernio** (`sk_` + 64 hex) y el `profileId`. Si el profile no existe todavía, se crea
   con `POST /v1/profiles` y listo.
2. **Conectar Instagram** — tiene que ser cuenta *Business* o *Creator*; las personales no sirven
   para la API. Se conecta desde el dashboard de Zernio y el CRM la descubre sola.
3. **Conectar WhatsApp** — ver la advertencia de abajo antes de hacer nada.
4. **Add-on de Analytics de Zernio** — es pago y aparte. Sin él, la pestaña Analíticas queda con los
   datos básicos (likes, comentarios) pero **sin alcance, impresiones ni histórico de seguidores**,
   que es justo lo que le da sentido. Conviene confirmarlo antes de construirla.
5. **Instancia de n8n**: URL pública + API key, y que la API pública esté habilitada
   (`N8N_PUBLIC_API_DISABLED` no debe estar activa).

### ⚠️ Advertencia sobre WhatsApp — leer antes de conectar

Conectar un número a la **API de WhatsApp Business** no es lo mismo que usar la app de WhatsApp
Business. Por defecto, el número **migra a la nube de Meta y deja de funcionar en la app del
celular**: pasa a atenderse solo desde la API.

Hay dos caminos:

- **Número nuevo, dedicado al CRM** — el más limpio. La atención pasa a ser por el CRM y el número
  personal queda intacto.
- **Coexistence** — permite mantener el número andando en la app del celular *y* en la API a la vez
  (se escanea un QR durante el alta), pero limita el throughput a 20 mensajes/segundo y deja fuera
  la API de grupos y las llamadas.

Necesito que elijas cuál antes de tocar la parte de WhatsApp. Es la decisión más difícil de
revertir de todo el proyecto, y depende de cómo usás hoy ese número, no del código.
