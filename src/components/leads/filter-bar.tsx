"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from "@/lib/constants"

const ALL = "__all__"

export function LeadFilterBar() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (!value || value === ALL) next.delete(key)
    else next.set(key, value)
    router.replace(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Buscar empresa o contacto…"
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => setParam("q", e.target.value)}
        className="h-9 w-64"
      />
      <Select
        defaultValue={params.get("status") ?? ALL}
        onValueChange={(v) => setParam("status", v)}
      >
        <SelectTrigger className="h-9 w-40">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los estados</SelectItem>
          {Object.entries(LEAD_STATUS_LABELS).map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        defaultValue={params.get("source") ?? ALL}
        onValueChange={(v) => setParam("source", v)}
      >
        <SelectTrigger className="h-9 w-40">
          <SelectValue placeholder="Fuente" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas las fuentes</SelectItem>
          {Object.entries(LEAD_SOURCE_LABELS).map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
