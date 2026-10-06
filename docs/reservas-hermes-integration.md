# Integración técnica del agente de ventas de Hermes

El comportamiento comercial se configura en el perfil del VPS por el equipo. Este documento describe exclusivamente el contrato entre servicios.

## Recorrido

Primer mensaje aprobado → cola única de WhatsApp → respuesta real del cliente en el CRM → Hermes → decisión para revisión → respuesta aprobada en la misma cola o reunión en calendario interno.

El workflow principal es **Operon Reservas — agente comercial**. Los anteriores tienen prefijo **ANTERIOR** y una copia local de respaldo. El principal y sus emisores siguen apagados; no se activan con el despliegue del CRM.

## Conexión del perfil dedicado

Variables sólo de servidor en Vercel:

| Variable | Contrato |
| --- | --- |
| `RESERVAS_HERMES_API_URL` | Base HTTPS del perfil, sin `/v1` al final. Puede incluir `/p/<perfil>` si el gateway instalado admite enrutamiento por perfil. |
| `RESERVAS_HERMES_API_KEY` | Clave propia de ese perfil. No usa la del Hermes general. |
| `RESERVAS_HERMES_TRANSCRIBE_URL` | Adaptador de audios del VPS, mismo origen HTTPS, autenticado con la clave del perfil. |
| `RESERVAS_AGENT_READY` | `false` hasta una prueba controlada satisfactoria. |

El CRM llama a `POST <base>/v1/chat/completions`, `stream:false`, sin prompt de sistema comercial ni override del modelo. La configuración del perfil elige el modelo. La memoria usa una identidad opaca por prospecto en ambos encabezados de sesión de Hermes. Una ejecución tiene una sola invocación; no se reintenta automáticamente después de timeout o error.

El mensaje de entrada contiene JSON con `kind:operon_reservas_turn`, el contexto real del CRM, hora y zona, el contrato de salida y una capacidad temporal para herramientas del CRM. No envía finanzas ni URLs privadas de adjuntos al modelo.

## Salida

La respuesta `choices[0].message.content` contiene JSON puro:

```json
{
  "intent": "question",
  "action": "draft_message",
  "reason": "Motivo de la decisión",
  "confidence": 0.8,
  "draft": "Texto para revisión"
}
```

`intent`: `interested`, `question`, `objection`, `meeting`, `unsubscribe`, `unknown`.

`action`: `draft_message`, `follow_up`, `request_human`, `no_action`, `book_meeting`.

`reason`: 1–2000 caracteres; `draft`: hasta 2000; `confidence`: número entre 0 y 1. Para mensajes, el borrador no puede estar vacío.

`book_meeting` incluye `meeting:{start,end,evidence_message_id}`: fechas ISO con zona, duración 15–20 minutos y UUID de un mensaje entrante real del prospecto. El servidor valida la evidencia, el contexto vigente y la aprobación; la disponibilidad se comprueba de nuevo al reservar.

## Herramientas de lectura

El campo `crm_tools` entrega URL y autorización temporal para `GET /api/ingest/reservas/agent/tools`. La autorización vence en tres minutos y sólo permite consultar la ejecución y lease actuales.

| Query `action` | Resultado |
| --- | --- |
| `context` | Prospecto, últimos 30 mensajes, 20 hitos y 5 revisiones anteriores. |
| `knowledge` | Información registrada en el CRM. |
| `availability&from=<ISO>&to=<ISO>` | Horarios libres: máximo 14 días por consulta, hasta 100 slots. |

No admite escritura, otro prospecto ni consultas después del cierre o cambio de contexto. La integración de estas herramientas dentro del perfil de Hermes la configura el equipo en el VPS.

## Audios

La documentación consultada de Hermes no confirma un endpoint nativo de transcripción. El adaptador del VPS recibe `POST {run_id,message_id,audio_url}` y devuelve `{transcript:"..."}`. La URL procede de un adjunto entrante real en el CRM y de dominios autorizados del proveedor. Se guarda la transcripción con el mensaje antes del análisis. Sin adaptador o con fallo: revisión humana, sin respuesta fabricada.

## Calendario y envíos

Agenda interna compartida, sin ventanas de atención obligatorias. Responsable inicialmente sin asignar; el equipo elige. Confirmación pendiente/confirmada y estado agendada/realizada/cancelada. Reservas serializadas para evitar superposiciones.

La cola sólo acepta el texto aprobado. Antes de enviar se verifican nuevamente baja, contexto, teléfono y texto exacto. La recepción de la cola y la confirmación del proveedor son estados distintos. Un timeout del proveedor congela el envío y no lo duplica. El CRM recibe un comprobante sólo tras la respuesta válida del proveedor; no se crean mensajes ficticios en el historial.

## Estado de verificación

Pruebas de contratos y permisos ejecutadas en Postgres embebido. Conexión del perfil dedicado, herramienta de audio, modelo efectivo, sincronización de mensajes Evolution/Zernio y una conversación completa siguen pendientes de verificación en el VPS. No se han enviado mensajes de prueba a clientes.

Referencias: [API de Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server), [perfiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles).
