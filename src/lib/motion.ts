export const ENTER =
  "animate-in fade-in duration-500 motion-reduce:animate-none"

export const ENTER_UP =
  "animate-in fade-in slide-in-from-bottom-3 duration-500 motion-reduce:animate-none"

export const ENTER_SIDE =
  "animate-in fade-in slide-in-from-right-4 duration-400 motion-reduce:animate-none"

export const ENTER_POP =
  "animate-in fade-in zoom-in-95 duration-500 motion-reduce:animate-none"

export function stagger(index: number, stepMs = 60): React.CSSProperties {
  return {
    animationDelay: `${index * stepMs}ms`,
    animationFillMode: "backwards",
  }
}
