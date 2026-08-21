"use client"

/**
 * Preferencias de Operon IA.
 *
 * Es una vista dentro del panel y no un diálogo aparte, por la misma razón que
 * el cajón: anidar un diálogo dentro del panel pelea por el foco. Y un cuadro
 * en tema claro saliendo de una superficie grafito se vería pegado con cinta.
 *
 * Acá sólo se elige **estilo**: cómo habla, qué tan largo, con cuánto humor.
 * Qué puede hacer Operon IA no se configura desde el navegador — eso lo fija
 * la política del servidor, que es la misma para las dos personas del equipo.
 */

import { useEffect, useId, useState } from "react"
import { ArrowLeft, Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  MAX_CUSTOM_PREFERENCES,
  type AssistantPreferences,
} from "@/lib/assistant/policy"
import { PREFERENCE_FIELDS } from "@/lib/assistant/ui"
import { readPreferences, writePreferences } from "@/app/(app)/assistant-actions"
import { useAssistant } from "./assistant-provider"

type Estado = "cargando" | "listo" | "guardando" | "error"

export function AssistantPreferences() {
  const { setView, applyIdentity } = useAssistant()

  const [prefs, setPrefs] = useState<AssistantPreferences | null>(null)
  const [estado, setEstado] = useState<Estado>("cargando")
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  // Se leen al abrir en vez de venir del servidor con el resto del panel:
  // son ocho campos que casi nunca se miran, y cargarlos siempre haría más
  // lento cada render del CRM entero.
  useEffect(() => {
    let vigente = true
    void readPreferences().then((result) => {
      if (!vigente) return
      if ("error" in result) {
        setEstado("error")
        setMensaje(result.error)
        return
      }
      setPrefs(result.preferences)
      setEstado("listo")
    })
    return () => {
      vigente = false
    }
  }, [])

  function update<K extends keyof AssistantPreferences>(
    key: K,
    value: AssistantPreferences[K]
  ) {
    setPrefs((prev) => (prev ? { ...prev, [key]: value } : prev))
    setGuardado(false)
  }

  async function guardar() {
    if (!prefs) return
    setEstado("guardando")
    setMensaje(null)

    const result = await writePreferences(prefs)
    if ("error" in result) {
      setEstado("error")
      setMensaje(result.error)
      return
    }

    // El servidor sanea: lo que vuelve puede no ser exactamente lo que se
    // mandó, y es eso lo que hay que mostrar.
    setPrefs(result.preferences)
    applyIdentity({
      displayName: result.preferences.displayName,
      preferredName: result.preferences.preferredUserName,
    })
    setEstado("listo")
    setGuardado(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setView("chat")}
          className="label-mono flex items-center gap-1.5 rounded-md px-2 py-1 text-[#FBF9F4]/60 transition-colors hover:bg-white/[0.08] hover:text-[#FBF9F4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Volver
        </button>
      </div>

      {/*
        `@container` y no un breakpoint de viewport: el panel mide 480px
        anclado y 1400px expandido con la misma ventana, así que preguntar por
        el ancho de la pantalla daría la respuesta equivocada en los dos casos.
      */}
      <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        {estado === "cargando" ? (
          <p className="label-mono flex items-center gap-2 py-8 text-[#FBF9F4]/50">
            <Loader2
              className="size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Cargando preferencias
          </p>
        ) : !prefs ? (
          <p role="alert" className="py-8 text-sm text-destructive">
            {mensaje ?? "No se pudieron cargar las preferencias."}
          </p>
        ) : (
          <div className="mx-auto max-w-xl space-y-6">
            <section className="space-y-3">
              <TextField
                label="Cómo se llama"
                help="El nombre que aparece arriba del panel."
                placeholder="Operon IA"
                value={prefs.displayName}
                onChange={(value) => update("displayName", value)}
              />
              <TextField
                label="Cómo querés que te diga"
                help="Va en el saludo. Puede ser tu nombre o el apodo que quieras."
                placeholder="Santiago"
                value={prefs.preferredUserName}
                onChange={(value) => update("preferredUserName", value)}
              />
            </section>

            <div className="grid gap-5 @2xl:grid-cols-2">
              {PREFERENCE_FIELDS.map((field) => (
                <Choice
                  key={field.key}
                  legend={field.legend}
                  help={field.help}
                  options={field.options}
                  value={prefs[field.key]}
                  onChange={(value) =>
                    update(
                      field.key,
                      value as AssistantPreferences[typeof field.key]
                    )
                  }
                />
              ))}
            </div>

            <section>
              <label
                htmlFor="custom-preferences"
                className="label-mono block text-[#FBF9F4]/70"
              >
                Algo más que quieras aclarar
              </label>
              <p className="mt-1 text-xs leading-relaxed text-[#FBF9F4]/45">
                Texto libre. Ajusta el estilo, no los permisos: pedirle acá que
                se salte una regla no cambia lo que puede hacer.
              </p>
              <textarea
                id="custom-preferences"
                rows={4}
                maxLength={MAX_CUSTOM_PREFERENCES}
                value={prefs.customPreferences ?? ""}
                onChange={(event) =>
                  update("customPreferences", event.target.value || null)
                }
                placeholder="Ej: cuando hables de plata, aclarame siempre si es en pesos o en dólares."
                className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm leading-relaxed text-[#FBF9F4] transition-colors placeholder:text-[#FBF9F4]/30 focus:border-white/25 focus:outline-none motion-reduce:transition-none"
              />
            </section>
          </div>
        )}
      </div>

      {prefs && (
        <div className="flex shrink-0 items-center gap-3 border-t border-white/10 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={estado === "guardando"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning",
              "motion-reduce:transition-none",
              estado === "guardando"
                ? "cursor-wait bg-white/[0.08] text-[#FBF9F4]/50"
                : "bg-warning text-[#14130F] hover:brightness-110"
            )}
          >
            {estado === "guardando" && (
              <Loader2
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            Guardar
          </button>

          {/* Un solo lugar para el resultado, y siempre con el rol correcto. */}
          <p
            role={estado === "error" ? "alert" : "status"}
            aria-live="polite"
            className={cn(
              "label-mono flex items-center gap-1.5",
              estado === "error" ? "text-destructive" : "text-[#FBF9F4]/55"
            )}
          >
            {estado === "error" ? (
              mensaje
            ) : guardado ? (
              <>
                <Check className="size-3" aria-hidden="true" />
                Guardado
              </>
            ) : null}
          </p>
        </div>
      )}
    </div>
  )
}

function TextField({
  label,
  help,
  placeholder,
  value,
  onChange,
}: {
  label: string
  help: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="label-mono block text-[#FBF9F4]/70">
        {label}
      </label>
      <p className="mt-1 text-xs leading-relaxed text-[#FBF9F4]/45">{help}</p>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[#FBF9F4] transition-colors placeholder:text-[#FBF9F4]/30 focus:border-white/25 focus:outline-none motion-reduce:transition-none"
      />
    </div>
  )
}

/**
 * Grupo de opciones excluyentes.
 *
 * Usa `radio` de verdad y no botones: así las flechas del teclado recorren el
 * grupo y un lector de pantalla anuncia "2 de 3", cosas que habría que
 * reconstruir a mano con `<button>`. El aspecto de segmento es sólo CSS.
 */
function Choice({
  legend,
  help,
  options,
  value,
  onChange,
}: {
  legend: string
  help: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  const name = useId()
  return (
    <fieldset>
      <legend className="label-mono text-[#FBF9F4]/70">{legend}</legend>
      <p className="mt-1 text-xs leading-relaxed text-[#FBF9F4]/45">{help}</p>
      <div className="mt-2 flex gap-1 rounded-lg bg-white/[0.05] p-1">
        {options.map((option) => {
          const active = option.value === value
          return (
            <label
              key={option.value}
              className={cn(
                "flex-1 cursor-pointer rounded-md px-2 py-1.5 text-center text-xs transition",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-warning",
                "motion-reduce:transition-none",
                active
                  ? "bg-white/[0.14] text-[#FBF9F4]"
                  : "text-[#FBF9F4]/50 hover:text-[#FBF9F4]/80"
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
