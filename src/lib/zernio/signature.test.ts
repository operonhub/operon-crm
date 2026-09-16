import { describe, expect, it } from "vitest"
import {
  LEGACY_SIGNATURE_HEADER,
  SIGNATURE_HEADER,
  readSignatureHeader,
  signPayload,
  verifySignature,
} from "./signature"

const SECRETO = "secreto-de-webhook-bien-largo-para-firmar"
const CUERPO = JSON.stringify({
  id: "evt_1",
  event: "message.received",
  message: { text: "Hola, quiero una web" },
})

describe("verifySignature", () => {
  it("acepta una firma calculada con el mismo secreto", () => {
    expect(verifySignature(CUERPO, signPayload(CUERPO, SECRETO), SECRETO)).toBe(true)
  })

  it("acepta la firma en mayúsculas: el hexadecimal no distingue caja", () => {
    const firma = signPayload(CUERPO, SECRETO).toUpperCase()
    expect(verifySignature(CUERPO, firma, SECRETO)).toBe(true)
  })

  it("rechaza si el cuerpo fue alterado en tránsito", () => {
    const firma = signPayload(CUERPO, SECRETO)
    const alterado = CUERPO.replace("Hola", "Hola!")
    expect(verifySignature(alterado, firma, SECRETO)).toBe(false)
  })

  it("rechaza una firma hecha con otro secreto", () => {
    const firma = signPayload(CUERPO, "otro-secreto-igual-de-largo-pero-distinto")
    expect(verifySignature(CUERPO, firma, SECRETO)).toBe(false)
  })

  it("rechaza cuando no llega firma: sin header no hay webhook válido", () => {
    expect(verifySignature(CUERPO, null, SECRETO)).toBe(false)
    expect(verifySignature(CUERPO, "", SECRETO)).toBe(false)
  })

  it("rechaza una firma de largo distinto sin explotar", () => {
    expect(verifySignature(CUERPO, "abc123", SECRETO)).toBe(false)
  })

  it("distingue dos cuerpos que sólo difieren en un carácter", () => {
    const a = signPayload('{"a":1}', SECRETO)
    const b = signPayload('{"a":2}', SECRETO)
    expect(a).not.toBe(b)
  })
})

describe("readSignatureHeader", () => {
  it("lee el header principal", () => {
    const headers = new Headers({ [SIGNATURE_HEADER]: "firma" })
    expect(readSignatureHeader(headers)).toBe("firma")
  })

  it("cae al alias histórico cuando no está el principal", () => {
    const headers = new Headers({ [LEGACY_SIGNATURE_HEADER]: "firma-vieja" })
    expect(readSignatureHeader(headers)).toBe("firma-vieja")
  })

  it("devuelve null cuando no hay ninguno", () => {
    expect(readSignatureHeader(new Headers())).toBeNull()
  })
})
