/**
 * Resultado estándar de las server actions que no redirigen.
 * Vive fuera de los archivos `"use server"`, que sólo pueden exportar
 * funciones async.
 */
export type ActionResult = { ok: true } | { error: string }
