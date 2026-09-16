/**
 * Configuración del acceso a Zernio.
 *
 * Mismo contrato que `readHermesConfig` (`src/lib/assistant/config.ts`): si
 * falta algo, el módulo se declara **no configurado y dice por qué**, en vez de
 * fallar a mitad de camino o simular datos. La Bandeja y Redes sociales usan
 * ese `reason` como texto de pantalla.
 *
 * Todas las variables son de servidor: ninguna lleva `NEXT_PUBLIC_`, porque eso
 * las metería en el bundle del navegador y la API key de Zernio da acceso de
 * escritura a WhatsApp e Instagram.
 */
export type ZernioConfig =
  | {
      configured: true
      baseUrl: string
      apiKey: string
      /** El "profile" agrupa las cuentas. Opcional: sin él se listan todas. */
      profileId: string | null
    }
  | { configured: false; reason: string }

export type ZernioWebhookConfig =
  | { configured: true; secret: string }
  | { configured: false; reason: string }

/** Base documentada de la API. Se puede apuntar a otra para pruebas. */
export const DEFAULT_ZERNIO_BASE_URL = "https://zernio.com/api/v1"

/**
 * Las claves de Zernio son `sk_` + 64 hexadecimales. No validamos el largo
 * exacto —si mañana lo cambian, no queremos romper— pero sí el prefijo: es lo
 * que distingue una API key de un secreto de webhook o de una clave de
 * Supabase, que es el error de copiar y pegar más común.
 */
const API_KEY_PREFIX = "sk_"
const MIN_API_KEY_LENGTH = 32

/**
 * El secreto de webhook lo elegimos nosotros (Zernio no lo genera), así que lo
 * único que se puede verificar es que sea lo bastante largo para que firmar con
 * HMAC signifique algo.
 */
const MIN_WEBHOOK_SECRET_LENGTH = 24

export function readZernioConfig(
  env: Record<string, string | undefined> = process.env
): ZernioConfig {
  const apiKey = env.ZERNIO_API_KEY?.trim()

  if (!apiKey) {
    return {
      configured: false,
      reason: "Falta ZERNIO_API_KEY. Se crea en el panel de Zernio.",
    }
  }
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return {
      configured: false,
      reason:
        "ZERNIO_API_KEY no parece una clave de Zernio: tiene que empezar con «sk_».",
    }
  }
  if (apiKey.length < MIN_API_KEY_LENGTH) {
    return {
      configured: false,
      reason: `ZERNIO_API_KEY es demasiado corta (mínimo ${MIN_API_KEY_LENGTH} caracteres).`,
    }
  }

  const baseUrl = env.ZERNIO_API_URL?.trim() || DEFAULT_ZERNIO_BASE_URL
  const profileId = env.ZERNIO_PROFILE_ID?.trim()

  return {
    configured: true,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    profileId: profileId ? profileId : null,
  }
}

export function readZernioWebhookConfig(
  env: Record<string, string | undefined> = process.env
): ZernioWebhookConfig {
  const secret = env.ZERNIO_WEBHOOK_SECRET?.trim()

  if (!secret) {
    return {
      configured: false,
      reason:
        "Falta ZERNIO_WEBHOOK_SECRET. Es el mismo valor que se registra en Zernio al dar de alta el webhook.",
    }
  }
  if (secret.length < MIN_WEBHOOK_SECRET_LENGTH) {
    return {
      configured: false,
      reason: `ZERNIO_WEBHOOK_SECRET es demasiado corto (mínimo ${MIN_WEBHOOK_SECRET_LENGTH} caracteres).`,
    }
  }

  return { configured: true, secret }
}

/**
 * Versión enmascarada de la clave, para mostrar en la pantalla de Conexiones.
 *
 * Existe para poder responder "¿está cargada la clave correcta?" sin que la
 * clave aparezca en una captura de pantalla ni en el HTML.
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) return "•".repeat(apiKey.length)
  return `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`
}
