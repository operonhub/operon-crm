# Panel comercial de Operon Reservas

Implementado localmente en `C:\Users\santi\Desktop\Claude Code\operon-crm-reservas-prospect-spine`, rama `feat/reservas-prospect-spine`, sobre `e95f654`. Este documento describe el segundo incremento; el contrato de ingesta está en `docs/operon-reservas-prospect-contract.md`.

## Pantalla y autorización

`/reservas-prospectos`, accesible en la navegación de escritorio y en el menú móvil bajo **Ventas de producto → Operon Reservas**. Panel, formularios y exportaciones exigen una sesión real y perfil interno. La proyección SQL usa `security_invoker` y las políticas de las tablas existentes; los RPC de lectura también comprueban membresía. No hay service-role en la aplicación.

El MCP `mcp__shadcn__view_items_in_registries` se buscó y no está disponible en la sesión. Santiago autorizó expresamente reutilizar componentes existentes. Se eligieron Table/Badge/Button/Input/Dialog, con un recorrido horizontal por etapas y una banda compacta de atención: priorizan lectura y trabajo comercial. Se conservan la marca, colores, transiciones y estilo del CRM. No se añadieron librerías ni efectos decorativos.

## Datos y tasas

El universo completo es `reservas_prospects`, no campañas generales, organizaciones por nombre ni números encontrados con regex. Un alojamiento cuenta una vez por hito. El panel muestra el histórico completo del piloto; los filtros y las páginas sólo afectan la tabla, nunca los denominadores.

| Métrica | Evidencia y denominador |
| --- | --- |
| Importados | Fichas del piloto |
| Contactados | Algún mensaje WhatsApp saliente enlazado, no eliminado y con estado sent/delivered/read; tasa sobre importados |
| Respondieron | Entrante no eliminado posterior al primer saliente válido; tasa sobre contactados |
| Agendaron | Evento meeting_scheduled; tasa de quienes tienen respuesta y agendamiento sobre quienes respondieron |
| Reunión realizada | Evento meeting_held; tasa de quienes tienen agendamiento y realización sobre quienes agendaron |
| Propuesta | Evento proposal_sent; tasa de quienes tienen reunión realizada y propuesta sobre quienes realizaron reunión |
| Ganados | Último hito comercial = won; tasa de ganados con propuesta sobre quienes tienen propuesta |
| Perdidos | Último hito comercial = lost |
| No contactar | Flag do_not_contact vigente, independiente del estado comercial |

No se infieren hitos omitidos. Un denominador cero muestra `—`, no 0% ni 100%. Los mensajes previos a la importación también cuentan si el hilo está enlazado: las fechas de evidencia se exportan para análisis por cohortes. El histórico incluye hitos anteriores a una supresión; no contactar no borra evidencia ni elimina al prospecto del denominador. El estado actual usa el último evento comercial por `occurred_at`, luego `recorded_at`, luego ID; cancelación de reunión tiene estado propio.

## Alertas y próximo paso

- **Respuesta pendiente**: algún hilo WhatsApp no archivado tiene un entrante válido posterior a su último saliente válido. Se calcula por hilo y luego por prospecto; leer un mensaje no equivale a responder. Un saliente fallido/pendiente no resuelve la alerta.
- **Seguimiento vencido**: próximo paso explícito con fecha anterior a hoy en Argentina. Se elige la fecha más temprana entre `opportunities.next_action` + `next_action_date` y tareas incompletas con `activities.body` + `due_date`, sólo de oportunidades unidas al `lead_id` del piloto. No se usa un plazo automático de 72 h ni se interpretan notas libres como compromisos.
- **Reunión en 48 h**: el último evento de reunión es meeting_scheduled y `details.scheduled_for` contiene una fecha con zona válida entre ahora y 48 h. Una meeting_held o meeting_cancelled posterior retira esa reunión. Se mantiene una reunión pendiente por prospecto; para varias simultáneas hará falta un meeting_id explícito.
- Supresión y estados ganado/perdido retiran las tres alertas de acción. Las cifras históricas permanecen.

Sin una fecha o próximo paso registrado, la tabla lo indica. Las tareas se administran en la ficha/oportunidad existente; el nuevo panel no crea oportunidades ni seguimientos por su cuenta. Los vínculos de chat resuelven ahora también hilos fuera de los 200 más recientes de Bandeja; un ID inválido ya no abre otro chat por error.

## Registrar hitos desde el CRM

El diálogo por fila registra reunión agendada/realizada/cancelada, propuesta, ganado/perdido y supresión/reanudación. La hora del formulario se interpreta explícitamente en Argentina (UTC−03); se rechazan fechas inválidas o hechos futuros. Agendar exige `scheduled_for`; pérdida, supresión y reanudación exigen motivo. El ID generado en el formulario permanece estable al reintentar. SQL deriva el actor de la sesión, no del contenido del formulario.

El CRM sigue siendo la fuente de verdad de los hitos. Si un hito lo registra el equipo acá, n8n no debe registrarlo de nuevo con otro ID/fuente. n8n sólo emite un hito observado y confirmado en su flujo, con su ID estable. Las reuniones se confirman tras acuerdo real y se realizan tras ocurrir; regex o respuestas de IA no constituyen confirmación.

## Exportaciones para Panam

`GET /api/reservas-prospectos/export?format=json` descarga el piloto completo con `schema_version`, período de lectura, zona, cantidad y fichas con arrays `events` y `messages`. `prospects[].id` es el `prospect_id` canónico; cada ficha conserva también `lead_id`. Incluye IDs originales, actor, source_event_id, occurred_at/recorded_at, texto, adjuntos, direction y delivery_status/deleted_at. Los estados fallidos/eliminados se conservan como evidencia y deben filtrarse al analizar mensajes efectivos.

`GET /api/reservas-prospectos/export?format=csv&dataset=prospectos|eventos|mensajes` ofrece tres archivos. Son UTF-8 con BOM, línea `sep=;`, punto y coma y filas CRLF; las celdas están entrecomilladas, y los prefijos de fórmula se neutralizan (el teléfono se conserva como texto). Fechas timestamp de CSV se normalizan a UTC; la fecha de próximo paso es día calendario argentino. Para pandas: saltar la primera línea y usar `sep=';'`. JSON conserva valores originales.

Las exportaciones incluyen **todo el piloto**, aunque la tabla esté filtrada. Se lee con keyset en bloques de 100 para superar el límite de 1000 filas de PostgREST. El límite de esta implementación es 5000 prospectos: arriba devuelve HTTP 413, nunca un archivo truncado. Para crecer hará falta exportación por período o streaming. La lectura paginada no es un snapshot transaccional; metadata indica inicio/fin y esa limitación. Los archivos se entregan con no-store y sólo a miembros del CRM, no al secreto de n8n.

## Dependencias de activación para Claude

1. Aplicar ambas migraciones del piloto en un entorno autorizado, antes de publicar el código; no se aplicaron remotamente.
2. Cumplir el contrato de identidad de Sheets y vincular los chats correctos a los leads. Si Zernio todavía no sincronizó el mensaje o falta el enlace, el panel muestra ausencia de evidencia; no completar métricas desde DataTables.
3. Preservar los guards de supresión del contrato de ingesta. La nueva pantalla/exportación no habilita envíos ni automatización.
4. Para alertas de reuniones, enviar `details.scheduled_for` ISO con zona. Para seguimientos, registrar el próximo paso en la oportunidad o tarea vinculada; la API de ingesta del primer incremento no crea esos registros.
5. Verificar un caso de extremo a extremo en un entorno controlado, incluyendo chat profundo, formulario y descarga con sesión, antes de activar el piloto real.

## Archivos de este incremento

Rutas relativas al worktree indicado al principio; se preservaron los archivos del primer incremento.

| Archivo | Cambio |
| --- | --- |
| supabase/migrations/20261004020000_reservas_sales_panel.sql | Proyección invoker, métricas/paginación y exportación RLS |
| src/app/(app)/reservas-prospectos/page.tsx | Panel, tasas, filtros, alertas y tabla |
| src/app/(app)/reservas-prospectos/actions.ts | Registro manual autenticado de hitos |
| src/components/reservas/milestone-dialog.tsx | Formulario de hitos confirmados |
| src/app/api/reservas-prospectos/export/route.ts | JSON y tres CSV con sesión/no-store |
| src/lib/reservas-sales.ts | Tipos, denominadores, fechas y CSV seguro |
| src/lib/reservas-sales-server.ts | Lecturas RPC y exportación paginada sin truncamiento |
| src/components/app-sidebar.tsx | Entrada propia en navegación compartida |
| src/app/(app)/bandeja/page.tsx | Enlace directo a chats fuera del top 200 |
| src/lib/supabase/types.ts | Tipos de los dos nuevos RPC |
| vitest.config.mts | Extiende la configuración existente para descubrir tests TSX además de TS |
| src/lib/rls/reservas-sales-panel.test.ts | Métricas, exclusión de otros negocios, RLS, exportación/paginación |
| src/lib/reservas-sales.test.ts | Denominadores, Argentina, CSV y fórmulas |
| src/app/(app)/reservas-prospectos/page.test.tsx | Estado poblado, vacío y error honestos |
| src/app/(app)/reservas-prospectos/actions.test.ts | Autorización, fechas y escrituras rechazadas |
| src/app/api/reservas-prospectos/export/route.test.ts | Sesión, JSON/CSV y errores sin archivos parciales |
| docs/operon-reservas-prospect-contract.md | Actualización del estado de panel/exportación |
| docs/operon-reservas-sales-panel.md | Este handoff y límites |

## Verificación local

Datos exclusivamente sintéticos. PGlite ejecuta las migraciones reales; tests de pantalla usan los componentes reales con sesión/datos mockeados. Se aprobaron 44 pruebas enfocadas (incluyendo las 22 del primer incremento/inbox), ESLint, TypeScript y build con Supabase local y clave sintética. La QA visual usa el render SSR del componente y CSS de producción: escritorio 1440×1000 y móvil 390×844 sin overflow horizontal, y tres enlaces visibles en el menú CSV. No sustituye la prueba de sesión, hidratación ni integración de una base real.

Sin migración remota, envío, cambio de VPS/n8n, commit, push ni deploy. Pendientes verificables: enlace/sincronización reales de Zernio, integración de n8n y sesión/descarga de extremo a extremo en un entorno autorizado.

## Publicación autorizada — 5 de octubre de 2026

Santiago autorizó publicar los cambios y continuar las correcciones en el CRM funcional. Se aplicaron las dos migraciones de Reservas a la base del CRM (ikmsptrdxytuaaowcyan), en una transacción, registradas en schema_migrations. Los párrafos anteriores sobre trabajo exclusivamente local describen la entrega inicial. No se cargaron prospectos sintéticos en producción. La integración n8n requiere configurar N8N_INGEST_SECRET y alinear el secreto de ingesta existente; esa variable no estaba configurada en Vercel al revisar la publicación. El panel y exportaciones usan la sesión del CRM y no requieren ese secreto.

La organización de Supabase del CRM está en Free. Este plan puede pausar la base por inactividad; publicar en Vercel no elimina esa condición. Para evitar la pausa por inactividad se requiere un plan de Supabase que no la aplique; el cambio de facturación queda pendiente de decisión de Santiago.

