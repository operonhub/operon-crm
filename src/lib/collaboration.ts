export type MentionProfile = {
  id: string
  full_name: string
  email?: string | null
}

export type MentionResolution = {
  profileIds: string[]
  unknownHandles: string[]
  mentionsTeam: boolean
}

function normalizeHandle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9._-]/g, "")
}

function profileHandles(profile: MentionProfile): string[] {
  const fullName = normalizeHandle(profile.full_name.replace(/\s+/g, "-"))
  const firstName = normalizeHandle(profile.full_name.split(/\s+/)[0] ?? "")
  const emailName = normalizeHandle(profile.email?.split("@")[0] ?? "")
  return [...new Set([fullName, firstName, emailName].filter(Boolean))]
}

/**
 * Las menciones deben comenzar la cadena o estar precedidas por un espacio.
 * Así no interpretamos el dominio de una dirección de email como una persona.
 */
export function extractMentionHandles(body: string): string[] {
  const handles: string[] = []
  const regex = /(?:^|\s)@([\p{L}\p{N}._-]+)/gu
  for (const match of body.matchAll(regex)) {
    const handle = match[1]?.replace(/[.,;:!?]+$/, "")
    if (handle && !handles.includes(handle)) handles.push(handle)
  }
  return handles
}

export function resolveMentions(
  body: string,
  profiles: MentionProfile[]
): MentionResolution {
  const handles = extractMentionHandles(body)
  const profileIds = new Set<string>()
  const unknownHandles: string[] = []
  const mentionsTeam = handles.some(
    (handle) => normalizeHandle(handle) === "equipo"
  )

  if (mentionsTeam) {
    profiles.forEach((profile) => profileIds.add(profile.id))
  }

  for (const handle of handles) {
    const normalized = normalizeHandle(handle)
    if (normalized === "equipo") continue
    const profile = profiles.find((candidate) =>
      profileHandles(candidate).includes(normalized)
    )
    if (profile) profileIds.add(profile.id)
    else unknownHandles.push(handle)
  }

  return {
    profileIds: [...profileIds],
    unknownHandles,
    mentionsTeam,
  }
}

export function isConversationUnread(
  lastMessageAt: string,
  lastReadAt: string | null
): boolean {
  if (!lastReadAt) return true
  return new Date(lastMessageAt).getTime() > new Date(lastReadAt).getTime()
}
