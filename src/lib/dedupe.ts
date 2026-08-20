/** Normaliza un dominio o URL a su host base (sin protocolo, www ni path). */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null
  let s = input.trim().toLowerCase()
  if (!s) return null
  s = s.replace(/^https?:\/\//, "")
  s = s.replace(/^www\./, "")
  s = s.split("/")[0]
  s = s.split("?")[0]
  s = s.split("#")[0]
  return s || null
}

export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null
  const s = input.trim().toLowerCase()
  return s || null
}

/** Comparación conservadora de razón social: mayúsculas y espacios no crean otra entidad. */
export function normalizeOrganizationName(
  input: string | null | undefined
): string | null {
  if (!input) return null
  const normalized = input.trim().replace(/\s+/g, " ").toLocaleLowerCase("es")
  return normalized || null
}
