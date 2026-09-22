import type { FinanceExchangeRateType } from "@/lib/constants"

const DOLAR_API_BASE = "https://dolarapi.com/v1/dolares"

type DolarApiResponse = {
  venta?: unknown
  fechaActualizacion?: unknown
}

export type ExchangeRateSnapshot = {
  type: Exclude<FinanceExchangeRateType, "none">
  sellRate: number
  quotedAt: string
}

export function parseDolarApiQuote(
  type: "official" | "blue",
  value: DolarApiResponse
): ExchangeRateSnapshot {
  const sellRate = Number(value.venta)
  if (!Number.isFinite(sellRate) || sellRate <= 0) {
    throw new Error("La cotización recibida no es válida.")
  }
  const rawDate = typeof value.fechaActualizacion === "string"
    ? value.fechaActualizacion
    : new Date().toISOString()
  const quotedAt = new Date(rawDate)
  return {
    type,
    sellRate,
    quotedAt: Number.isNaN(quotedAt.valueOf())
      ? new Date().toISOString()
      : quotedAt.toISOString(),
  }
}

async function fetchQuote(type: "official" | "blue") {
  const endpoint = type === "official" ? "oficial" : "blue"
  const response = await fetch(`${DOLAR_API_BASE}/${endpoint}`, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(6_000),
  })
  if (!response.ok) {
    throw new Error("No se pudo consultar la cotización del dólar.")
  }
  return parseDolarApiQuote(type, (await response.json()) as DolarApiResponse)
}

export async function getExchangeRateSnapshot(
  type: FinanceExchangeRateType,
  manualRate?: number | null
): Promise<ExchangeRateSnapshot | null> {
  if (type === "none") return null
  if (type === "manual") {
    if (!manualRate || !Number.isFinite(manualRate) || manualRate <= 0) {
      throw new Error("Ingresá una cotización manual mayor que cero.")
    }
    return { type, sellRate: manualRate, quotedAt: new Date().toISOString() }
  }
  return fetchQuote(type)
}

export async function getCurrentExchangeRates() {
  const [official, blue] = await Promise.all([
    fetchQuote("official"),
    fetchQuote("blue"),
  ])
  return { official, blue }
}

export function convertUsdToArs(amountUsd: number, sellRate: number) {
  return Math.round(amountUsd * sellRate * 100) / 100
}
