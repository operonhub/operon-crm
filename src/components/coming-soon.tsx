import { PageHeader } from "@/components/page-header"
import { Hammer } from "lucide-react"

export function ComingSoon({
  title,
  note,
}: {
  title: string
  note?: string
}) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center text-muted-foreground">
        <Hammer className="h-8 w-8" />
        <p className="text-sm">{note ?? "En construcción."}</p>
      </div>
    </>
  )
}
