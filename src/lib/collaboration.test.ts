import { describe, expect, it } from "vitest"
import {
  extractMentionHandles,
  isConversationUnread,
  resolveMentions,
} from "./collaboration"

const PROFILES = [
  { id: "00000000-0000-0000-0000-000000000001", full_name: "Santiago", email: "santi@operonhub.com" },
  { id: "00000000-0000-0000-0000-000000000002", full_name: "Tomi", email: "tomi@operonhub.com" },
]

describe("menciones internas", () => {
  it("extrae handles sin confundir direcciones de email", () => {
    expect(
      extractMentionHandles("@Santiago revisá esto con @Tomi. Escribí a hola@operonhub.com")
    ).toEqual(["Santiago", "Tomi"])
  })

  it("resuelve perfiles por nombre sin hardcodear IDs", () => {
    const result = resolveMentions("@santiago y @TOMI, ¿lo ven?", PROFILES)
    expect(result.profileIds).toEqual(PROFILES.map((profile) => profile.id))
    expect(result.unknownHandles).toEqual([])
    expect(result.mentionsTeam).toBe(false)
  })

  it("expande @equipo a todos los perfiles y reporta desconocidos", () => {
    const result = resolveMentions("@equipo necesito ayuda de @Nadie", PROFILES)
    expect(result.profileIds).toEqual(PROFILES.map((profile) => profile.id))
    expect(result.unknownHandles).toEqual(["Nadie"])
    expect(result.mentionsTeam).toBe(true)
  })
})

describe("leído y no leído", () => {
  it("marca no leído solo cuando hay un mensaje posterior", () => {
    expect(isConversationUnread("2026-08-20T12:00:00Z", null)).toBe(true)
    expect(
      isConversationUnread("2026-08-20T12:00:00Z", "2026-08-20T11:59:59Z")
    ).toBe(true)
    expect(
      isConversationUnread("2026-08-20T12:00:00Z", "2026-08-20T12:00:00Z")
    ).toBe(false)
  })
})
