import { createClient } from "@/lib/supabase/server"
import { readHermesConfig } from "@/lib/assistant/config"
import { DEFAULT_PREFERENCES } from "@/lib/assistant/policy"
import type { ConversationSummary } from "@/lib/assistant/ui"
import { AssistantProvider } from "./assistant-provider"
import { AssistantLauncher } from "./assistant-launcher"
import { AssistantPanel } from "./assistant-panel"

/**
 * Punto de montaje de Operon IA. Es lo único que importa el layout.
 *
 * Se monta como hermano de `<main>`, nunca adentro: si viviera en el slot de
 * `children`, se remontaría en cada navegación y la conversación se perdería.
 */
export async function AssistantMount() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: assistantProfile }, { data: profile }, { data: conversations }] =
    await Promise.all([
      supabase
        .from("assistant_profiles")
        .select("display_name, preferred_user_name")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase
        .from("assistant_conversations")
        .select("id, title, updated_at")
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(30),
    ])

  return (
    <AssistantProvider
      // Sólo el booleano: `reason` nombra variables de entorno y no tiene por
      // qué viajar al navegador.
      configured={readHermesConfig().configured}
      displayName={assistantProfile?.display_name || DEFAULT_PREFERENCES.displayName}
      preferredName={assistantProfile?.preferred_user_name ?? ""}
      fullName={profile?.full_name ?? ""}
      initialConversations={(conversations ?? []) as ConversationSummary[]}
    >
      <AssistantLauncher />
      <AssistantPanel />
    </AssistantProvider>
  )
}
