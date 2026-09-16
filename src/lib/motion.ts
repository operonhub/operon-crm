/**
 * Tokens de movimiento del CRM.
 *
 * Regla de la casa: el movimiento grande sólo en momentos pico (primera entrada
 * a una vista, un número que cuenta, un gráfico que se dibuja); lo repetido
 * —hover, cambiar de pestaña, enviar un mensaje— casi imperceptible. Todo sobre
 * transform y opacity, que el navegador anima sin recalcular layout.
 *
 * `motion-reduce` está en cada token, y además `globals.css` anula los
 * desplazamientos de tw-animate-css con `prefers-reduced-motion`.
 */

/** Fundido de entrada de un bloque. */
export const ENTER = "animate-in fade-in duration-500 motion-reduce:animate-none"

/** Fundido con una leve subida: para la primera aparición de contenido. */
export const ENTER_UP =
  "animate-in fade-in slide-in-from-bottom-3 duration-500 motion-reduce:animate-none"

/** Más corto y con menos recorrido: para listas y elementos que se repiten. */
export const ENTER_SOFT =
  "animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"

/** Elevación al pasar el mouse sobre algo clickeable. */
export const LIFT =
  "transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"

/**
 * Retraso escalonado para que un grupo entre en cascada.
 * El tope evita que el elemento veinte espere un segundo entero para aparecer.
 */
export function stagger(index: number, stepMs = 60, maxMs = 360): React.CSSProperties {
  return {
    animationDelay: `${Math.min(index * stepMs, maxMs)}ms`,
    animationFillMode: "backwards",
  }
}
