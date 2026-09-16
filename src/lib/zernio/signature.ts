import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Verificación de la firma de los webhooks de Zernio.
 *
 * Zernio firma el **cuerpo crudo** con HMAC-SHA256 usando el secreto que
 * elegimos nosotros al dar de alta el webhook, y manda el resultado en
 * hexadecimal minúscula.
 *
 * Es la única barrera del endpoint: cualquiera en internet puede hacer POST a
 * `/api/zernio/webhook`, así que sin esta verificación cualquiera podría
 * inyectar mensajes falsos en la Bandeja del CRM.
 */

/** Header principal. El segundo es el alias histórico que Zernio mantiene. */
export const SIGNATURE_HEADER = "x-zernio-signature"
export const LEGACY_SIGNATURE_HEADER = "x-late-signature"

export function signPayload(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
}

/**
 * Compara la firma recibida con la calculada, en tiempo constante.
 *
 * Una comparación normal de strings corta en el primer carácter distinto, y esa
 * diferencia de microsegundos alcanza para adivinar la firma byte a byte. Por
 * eso va `timingSafeEqual`, que siempre recorre todo.
 */
export function verifySignature(
  rawBody: string,
  receivedSignature: string | null | undefined,
  secret: string
): boolean {
  if (!receivedSignature) return false

  const received = receivedSignature.trim().toLowerCase()
  const expected = signPayload(rawBody, secret)

  // `timingSafeEqual` explota si los buffers miden distinto, y el largo de la
  // firma es público (siempre 64 hex), así que cortar acá no filtra nada.
  if (received.length !== expected.length) return false

  return timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"))
}

/** Toma la firma de cualquiera de los dos headers que Zernio puede mandar. */
export function readSignatureHeader(headers: Headers): string | null {
  return headers.get(SIGNATURE_HEADER) ?? headers.get(LEGACY_SIGNATURE_HEADER)
}
