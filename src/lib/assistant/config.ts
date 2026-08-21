import { createHash } from "node:crypto"

/**
 * Configuración del acceso a Hermes.
 *
 * Las dos variables son **sólo de servidor**: nunca llevan prefijo
 * `NEXT_PUBLIC_`, porque eso las enviaría al navegador dentro del bundle.
 * Si falta cualquiera de las dos, el asistente se comporta como no
 * configurado y lo dice — no simula respuestas.
 */
export type HermesConfig =
  | { configured: true; baseUrl: string; apiKey: string }
  | { configured: false; reason: string }

/** Hermes exige al menos 16 caracteres para aceptar la clave. */
const MIN_KEY_LENGTH = 16

export function readHermesConfig(
  env: Record<string, string | undefined> = process.env
): HermesConfig {
  const baseUrl = env.HERMES_API_URL?.trim()
  const apiKey = env.HERMES_API_KEY?.trim()

  if (!baseUrl) {
    return { configured: false, reason: "Falta HERMES_API_URL." }
  }
  if (!apiKey) {
    return { configured: false, reason: "Falta HERMES_API_KEY." }
  }
  if (apiKey.length < MIN_KEY_LENGTH) {
    return {
      configured: false,
      reason: `HERMES_API_KEY es demasiado corta (mínimo ${MIN_KEY_LENGTH}).`,
    }
  }

  return { configured: true, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey }
}

/**
 * Identificador estable y opaco de la persona, para `X-Hermes-Session-Key`.
 *
 * Hermes usa ese header para aislar la memoria de largo plazo entre canales.
 * Derivarlo del `user_id` garantiza que Santiago y Tomi nunca compartan
 * espacio; usar un hash evita mandar el identificador real fuera del CRM.
 */
export function sessionKeyForUser(userId: string): string {
  return createHash("sha256").update(`operon-ia:${userId}`).digest("hex").slice(0, 32)
}
