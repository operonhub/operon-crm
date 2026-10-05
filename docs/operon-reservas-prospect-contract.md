# Operon Reservas: contrato del piloto comercial

Estado: implementación local para revisión. No se migró la base de producción ni se cambió n8n.

## Identidad y responsables

- **Sheets** mantiene el identificador estable `sheet_lead_id` en la columna A (`lead_id`) y el `sheet_id` del documento. No usar número de fila: cambia al ordenar la hoja. La clave CRM es `reservas:sheet:<sheet_id>:<sheet_lead_id>` en `leads.external_id`.
- **CRM** es dueño de `reservas_prospects.id`, `leads.id`, del estado `do_not_contact` y de los hitos comerciales. La misma pareja `sheet_id`/`sheet_lead_id` reutiliza siempre el registro. La ficha guarda el URL de la hoja y el teléfono E.164 con `+`.
- **Zernio** es dueño del historial de mensajes de WhatsApp (`social_conversations` y `social_messages`). n8n no copia mensajes ni crea eventos `reply_received`/`outbound_sent` en el funnel. Así se evitan dos conteos del mismo mensaje.
- **n8n** importa y envía únicamente tras consultar el estado de contacto del CRM. Conserva `sheet_id`, `sheet_lead_id`, `prospect_id`, `lead_id` y `do_not_contact` en staging/cola. Sus DataTables no son la fuente del funnel.
- **Vinculación del chat**: un miembro del CRM debe confirmar el hilo correcto y ejecutar `link_reservas_conversation(prospect_id, conversation_id)`. El RPC exige WhatsApp, rechaza un hilo unido a otro lead y es idempotente. No vincular automáticamente por número hasta verificar cómo Zernio entrega `participant_external_id` y resolver números compartidos por varios alojamientos.

## API privada para Claude/n8n

`POST /api/ingest/reservas`, `Authorization: Bearer <N8N_INGEST_SECRET>`, JSON. El endpoint y la función SQL comprueban el secreto. Cada petición contiene un objeto. `ok: false` indica rechazo; no interpretar el HTTP 200 como éxito sin leer `ok`.

Importar un alojamiento (tras validar que la columna A contiene un ID estable):

```json
{
  "kind": "prospect",
  "sheet_id": "sheet_demo_01",
  "sheet_lead_id": "alojamiento_001",
  "sheet_url": "https://docs.google.com/spreadsheets/d/sheet_demo_01/edit#gid=0",
  "empresa": "Hostería de prueba",
  "phone_e164": "+5491123456789",
  "do_not_contact": false,
  "suppression_reason": null,
  "actor": "n8n:workflow-7"
}
```

Respuesta: `lead_id`, `prospect_id`, `action: created|updated`, `do_not_contact`. `phone_e164` debe incluir código internacional; no adivinar `+54` para números locales. `sheet_id` y `sheet_lead_id` admiten letras, dígitos, `_`, `-` y hasta 60 caracteres. Reintentar el mismo objeto es seguro; un `true` en `do_not_contact` persiste incluso si un reintento trae `false`. El CRM sólo levanta el bloqueo mediante una acción explícita de un miembro con motivo registrado.

El URL debe corresponder al `sheet_id` enviado. Un mismo teléfono con otra identidad de Sheets devuelve `identity_conflict` antes de crear otra ficha: detener esa fila y revisar si es un duplicado o si varios alojamientos comparten teléfono. No fusionarlos automáticamente; la resolución de aliases o teléfonos compartidos queda pendiente para esos casos excepcionales.

Hito comercial desde n8n, si ese sistema fue quien observó el hecho:

```json
{
  "kind": "event",
  "prospect_id": "<uuid-devuelto-por-la-importacion>",
  "event_id": "workflow-4:execution-123:meeting-confirmed",
  "event_type": "meeting_scheduled",
  "actor": "n8n:workflow-4",
  "occurred_at": "2026-10-04T18:30:00Z",
  "details": { "scheduled_for": "2026-10-06T20:00:00Z", "timezone": "America/Argentina/Buenos_Aires" }
}
```

`event_id` es estable al reintentar y único por `source=n8n`. El mismo ID con contenido diferente devuelve `event_id_conflict`. `occurred_at` es el momento en que ocurrió el hito, ISO 8601 con zona horaria; `scheduled_for` es la fecha futura de la reunión y vive en `details`. El servidor registra también `recorded_at` y el actor. Tipos aceptados para n8n: `meeting_scheduled`, `meeting_held`, `meeting_cancelled`, `proposal_sent`, `won`, `lost`, `suppressed`. La conversación natural y los audios no son parte de esta API. Un miembro puede registrar esos hitos y `unsuppressed` vía `record_reservas_event(payload)`; `unsuppressed` exige `details.reason`.

Consulta inmediatamente anterior a cada envío: `GET /api/ingest/reservas?prospect_id=<uuid>` con el mismo Bearer. Devuelve `ok`, `lead_id`, `phone_e164`, `do_not_contact`, `updated_at`. Si la respuesta falla, falta el prospecto, el número no coincide con el destinatario de la cola o `do_not_contact=true`, **no enviar**. Esa lectura acorta la ventana entre cambio de permiso y envío, aunque no puede convertir un envío externo en una transacción atómica con la base.

## Secuencia de integración en el VPS (pendiente)

1. En Workflow 7, comprobar `lead_id` de columna A. Si falta, generar un UUID y escribirlo en la hoja **antes** de importarlo; jamás usar la posición de fila como ID. Enviar `kind=prospect` al CRM y guardar los IDs de la respuesta en staging.
2. En Workflow 8 y en la cola, pasar la misma identidad y el estado `do_not_contact`. Antes de aprobar y **justo antes de cada envío** en Workflow 9, llamar al GET anterior y comparar `phone_e164` con el destinatario. La copia en DataTables puede quedar vieja. Mantener el sender deshabilitado para esta integración hasta verificar ese guard en el VPS.
3. Workflow 9 sigue siendo el único emisor. Sólo reportar un hito comercial cuando exista evidencia de ese hito. No registrar un envío o respuesta como evento de funnel; Zernio los registra en `social_messages`.
4. Workflow 3 y Workflow 4 conservan borradores y aprobación humana. Cuando una reunión quede efectivamente acordada, crear `meeting_scheduled` con un `event_id` estable. `meeting_held` se registra después de ocurrir, no al agendar. La demo es opcional; la meta del primer contacto es una reunión.
5. Registrar `proposal_sent`, `won` o `lost` sólo tras la acción real. Ante “no me escriban”, enviar `suppressed` antes de cualquier seguimiento. El workflow de seguimientos no debe activarse hasta que el guard de supresión y la integración estén verificados.

El borrador de apertura acordado es: “Hola, ¿cómo estás? Soy Santiago, de Operon. Vi el alojamiento y quería consultarte algo concreto: ¿hoy reciben reservas desde una web propia o gestionan la mayoría por WhatsApp y plataformas?” Es una plantilla de trabajo, no un envío autorizado. Santiago suele poder después de las 14–15 h y Tomy después de las 17 h; no inferir disponibilidad ni confirmar reuniones sin calendario compartido.

La Bandeja comprueba `do_not_contact` antes de enviar cuando el hilo está enlazado al lead del prospecto. Un hilo sin enlace no se puede reconocer todavía como ese alojamiento: el piloto exige resolver ese vínculo antes de responder desde el CRM. La activación requiere aplicar la migración, publicar el código, comprobar que `N8N_INGEST_SECRET` coincide con `ingest_config.secret`, e integrar/verificar los guards de n8n en un entorno controlado. Nada de eso se ejecutó en este incremento.

## Vista y exportación del segundo incremento

La pantalla `/reservas-prospectos` ya está implementada con navegación propia, métricas del piloto, alertas, tabla, enlace al chat y registro manual de hitos. Sus lecturas están restringidas por membresía y RLS al universo de `reservas_prospects`; no se cambiaron las métricas generales. El detalle operativo y los denominadores están en `docs/operon-reservas-sales-panel.md`.

La exportación JSON incluye la ficha, sus eventos y mensajes originales de Zernio. Se ofrecen tres CSV compatibles con Excel: prospectos, eventos y mensajes, unidos por `prospect_id`/`lead_id`. Requieren sesión de un miembro del CRM y no mezclan conversaciones de otros negocios. Su autorización corresponde al pedido de exportar para Panam; la conexión real de Zernio/n8n todavía requiere verificación.

## Verificación local del primer incremento — 4 de octubre de 2026

- Worktree: `operon-crm-reservas-prospect-spine`, rama `feat/reservas-prospect-spine`, base `e95f654`. Checkout original limpio, conservado en `56c0f2b`.
- `vitest run src/lib/rls/reservas-prospect-spine.test.ts src/lib/rls/social-inbox.test.ts`: 22 pruebas aprobadas. La suite del prospecto se repitió después de las correcciones finales: 2/2 aprobadas.
- `next typegen` y `tsc --noEmit`: aprobados. ESLint sobre los cuatro archivos TypeScript modificados/agregados: aprobado. `git diff --check` y revisión de espacios de los archivos nuevos: sin errores.
- `npm run build`: aprobado con dependencias propias del worktree, URL Supabase `http://127.0.0.1:54321` y clave de build sintética. El primer intento con un junction a las dependencias del checkout original falló por el límite de filesystem de Turbopack; se resolvió instalando dependencias propias, sin modificar configuración.
- PGlite aplicó las migraciones reales y verificó identidad, RLS, reintentos, conflictos de ID/teléfono, chat, fechas, hitos y supresión/rebloqueo. No se probaron HTTP contra una base real, entrega de mensajes, integración del VPS, UI ni exportación. No hubo commit, push, despliegue ni migración remota.
