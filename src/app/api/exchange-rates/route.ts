import { NextResponse } from "next/server"
import { getCurrentExchangeRates } from "@/lib/exchange-rates"

export async function GET() {
  try {
    return NextResponse.json(await getCurrentExchangeRates(), {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cotización no disponible."
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
