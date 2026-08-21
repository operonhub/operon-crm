import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/supabase/types"

export async function writeAudit(
  supabase: SupabaseClient<Database>,
  actorId: string,
  entity: string,
  entityId: string | null,
  action: string,
  metadata?: Json
) {
  const { error } = await supabase.from("audit_log").insert({
    user_id: actorId,
    entity,
    entity_id: entityId,
    action,
    metadata: metadata ?? null,
  })
  if (error) {
    console.error("[audit] no se pudo registrar la acción", {
      entity,
      action,
      code: error.code,
    })
  }
}
