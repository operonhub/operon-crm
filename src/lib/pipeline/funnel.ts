/**
 * Lógica del embudo del pipeline.
 *
 * Pura y sin JSX: qué tan ancha va cada etapa, qué proporción del pipeline
 * llegó hasta ella y cuán frío está cada trato. El componente queda como
 * envoltorio y estas decisiones se prueban sin navegador.
 */

import { todayISO } from "@/lib/format"

// ------------------------------------------------------------------ ancho

/**
 * Ancho mínimo de una etapa, en la misma unidad que el reparto proporcional.
 *
 * Sin este piso, una etapa vacía colapsaría a cero: dejaría de ser un destino
 * visible para arrastrar una ficha, y el embudo pasaría a ocultar justamente
 * la información más útil —dónde no hay nada— en vez de mostrarla.
 *
 * Es independiente del ancho mínimo en píxeles de la columna
 * (`min-w-28` en el componente): ese mínimo evita que el CSS colapse la
 * columna antes de que el flujo tenga margen para repartir proporcionalmente,
 * y tiene que ser chico para que en pantallas con muchas etapas activas la
 * diferencia entre una etapa llena y una vacía siga siendo visible en vez de
 * perderse en overflow horizontal.
 */
const MIN_SHARE = 1

/**
 * Reparte el ancho entre etapas en proporción a cuántas fichas tiene cada una.
 *
 * Devuelve valores para `flex-grow`, no píxeles: el navegador reparte el
 * espacio disponible y el embudo se adapta solo a la ventana, sin que haya que
 * medir nada ni recalcular al redimensionar.
 */
export function funnelWidths(counts: number[]): number[] {
  return counts.map((count) => MIN_SHARE + Math.max(0, count))
}

// ------------------------------------------------------------ proporción

/**
 * Qué proporción del pipeline está en esta etapa o en una posterior.
 *
 * **No es una tasa de conversión.** Una conversión compara cuántas
 * oportunidades pasaron de una etapa a la siguiente a lo largo del tiempo, y
 * eso exige historial de cambios de etapa que el CRM no guarda. Esto es una
 * foto del estado actual, y la interfaz tiene que decirlo con esas palabras.
 *
 * Se calcula acumulando desde el final para que la primera etapa dé siempre
 * 100% y el número baje a medida que el embudo se angosta.
 */
export function reachedShares(counts: number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0)
  if (total === 0) return counts.map(() => 0)

  const shares: number[] = []
  let acumulado = 0
  for (let i = counts.length - 1; i >= 0; i--) {
    acumulado += counts[i]
    shares[i] = Math.round((acumulado / total) * 100)
  }
  return shares
}

// ------------------------------------------------------------ antigüedad

export type Staleness = {
  /** Días enteros desde el último movimiento. `null` si nunca hubo. */
  days: number | null
  level: "hoy" | "reciente" | "tibio" | "frio" | "helado" | "sin-registro"
  label: string
}

/**
 * Umbrales en días. Elegidos para un ciclo de venta de servicios, donde una
 * semana sin tocar un trato ya es una señal y dos son un problema.
 */
const TIBIO = 3
const FRIO = 7
const HELADO = 14

/**
 * Cuánto hace que no pasa nada con esta oportunidad.
 *
 * Trabaja en días del calendario argentino: `todayISO` formatea con la zona
 * horaria del equipo, no con la del servidor —que en Vercel es UTC— así que
 * algo de ayer a la noche no aparece como de hoy.
 */
export function stalenessOf(
  lastActivityAt: string | null | undefined,
  today: string = todayISO()
): Staleness {
  if (!lastActivityAt) {
    return {
      days: null,
      level: "sin-registro",
      label: "Sin actividad registrada",
    }
  }

  const days = daysBetween(isoDayOf(lastActivityAt), today)
  if (days === null) {
    return { days: null, level: "sin-registro", label: "Sin actividad registrada" }
  }

  // Una fecha futura (reloj desincronizado, o algo agendado) cuenta como hoy:
  // preferimos mostrarla fresca antes que como un número negativo raro.
  if (days <= 0) return { days: 0, level: "hoy", label: "Hoy" }
  if (days === 1) return { days, level: "reciente", label: "Ayer" }
  if (days < TIBIO) return { days, level: "reciente", label: `Hace ${days} días` }
  if (days < FRIO) return { days, level: "tibio", label: `Hace ${days} días` }
  if (days < HELADO) return { days, level: "frio", label: `Hace ${days} días` }
  return { days, level: "helado", label: `Hace ${days} días` }
}

/**
 * Día argentino de un timestamp.
 *
 * No sirve cortar el string en la "T": eso da la fecha UTC y, como Argentina
 * va tres horas atrás, todo lo posterior a las 21:00 quedaría con la fecha del
 * día siguiente. Se reformatea con `todayISO`, que ya usa la zona del equipo.
 */
function isoDayOf(value: string): string | null {
  if (!value.includes("T")) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : todayISO(date)
}

/** Días enteros entre dos fechas ISO. Opera en UTC para no cruzar husos. */
function daysBetween(from: string | null, to: string): number | null {
  if (!from) return null
  const desde = Date.parse(`${from}T00:00:00Z`)
  const hasta = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return null
  return Math.round((hasta - desde) / 86_400_000)
}

// --------------------------------------------------------- próxima acción

export type NextAction = {
  state: "vencida" | "hoy" | "proxima" | "sin-definir"
  label: string
}

/**
 * Estado de la próxima acción comprometida.
 *
 * "Sin definir" no es un estado neutro: en una etapa activa significa que el
 * trato no tiene a nadie empujándolo, y por eso se muestra igual de fuerte que
 * una acción vencida.
 */
export function nextActionOf(
  action: string | null | undefined,
  date: string | null | undefined,
  today: string = todayISO()
): NextAction {
  if (!action?.trim()) {
    return { state: "sin-definir", label: "Sin próxima acción" }
  }
  if (!date) return { state: "proxima", label: action }

  const dia = date.split("T")[0]
  if (dia < today) return { state: "vencida", label: action }
  if (dia === today) return { state: "hoy", label: action }
  return { state: "proxima", label: action }
}
