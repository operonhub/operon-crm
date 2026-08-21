/**
 * Resultado estándar de las server actions que no redirigen.
 * Vive fuera de los archivos `"use server"`, que sólo pueden exportar
 * funciones async.
 */
export type FieldErrors = Record<string, string[]>

/**
 * Contrato compatible con las acciones existentes, ampliado para formularios
 * con feedback, errores por campo y datos de retorno.
 */
export type ActionResult<T = undefined> =
  | {
      ok: true
      data?: T
      message?: string
    }
  | {
      error: string
      fieldErrors?: FieldErrors
    }
