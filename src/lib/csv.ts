/** Parser de CSV mínimo con soporte de comillas y saltos de línea dentro de campos. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ""
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ",") {
        pushField()
      } else if (c === "\r") {
        // ignorar; el \n hace el salto
      } else if (c === "\n") {
        pushRow()
      } else {
        field += c
      }
    }
  }
  // último campo/fila si no terminó en newline
  if (field.length > 0 || row.length > 0) pushRow()

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""))
}

/** Normaliza un header a una clave conocida. */
export function normalizeHeader(h: string): string {
  const s = h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
  if (["empresa", "organizacion", "organización", "company", "nombre empresa"].includes(s))
    return "empresa"
  if (["web", "sitio", "website", "dominio", "url"].includes(s)) return "web"
  if (["contacto", "nombre", "contact", "nombre contacto"].includes(s))
    return "contacto"
  if (["email", "mail", "correo", "e-mail"].includes(s)) return "email"
  if (["telefono", "teléfono", "phone", "tel", "celular"].includes(s))
    return "telefono"
  if (["fuente", "source", "origen"].includes(s)) return "fuente"
  if (["servicio", "service", "interes", "interés"].includes(s))
    return "servicio"
  if (["segmento", "icp", "segment"].includes(s)) return "segmento"
  return s
}
