import { CountUp } from "@/components/shell/count-up"
import { formatMoney } from "@/lib/format"
import type { MoneyByCurrency } from "@/lib/finance"

/**
 * Importe en pesos y dólares dentro de un KPI.
 *
 * Cuenta sólo la moneda principal —la que tiene importe, pesos si tienen las
 * dos—; la otra acompaña quieta y más chica. Dos números contando a la vez
 * distraen más de lo que informan.
 */
export function MoneyPair({ totals }: { totals: MoneyByCurrency }) {
  const main = totals.ARS === 0 && totals.USD !== 0 ? "USD" : "ARS"
  const other = main === "ARS" ? "USD" : "ARS"
  return (
    <span className="block">
      <CountUp value={totals[main]} format={{ kind: "money", currency: main }} className="block" />
      <span className="mt-1.5 block text-sm font-medium text-muted-foreground">
        {formatMoney(totals[other], other)}
      </span>
    </span>
  )
}
