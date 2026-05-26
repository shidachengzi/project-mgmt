import type { ReactNode } from 'react'

export type ResizableColumnTitleOptions = {
  minWidth?: number
}

export function resizableColumnTitle(
  title: ReactNode,
  _columnKey: string,
  width: number,
  onWidthChange: (nextWidth: number) => void,
  { minWidth = 64 }: ResizableColumnTitleOptions = {},
) {
  return (
    <span className="wt-resizable-th">
      <span className="wt-resizable-th__text">{title}</span>
      <span
        className="wt-resizable-th__handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整列宽"
        onMouseDown={e => {
          e.preventDefault()
          e.stopPropagation()
          const startX = e.clientX
          const startW = width
          const onMove = (ev: MouseEvent) => {
            onWidthChange(Math.max(minWidth, Math.round(startW + ev.clientX - startX)))
          }
          const onUp = () => {
            document.removeEventListener('mousemove', onMove, true)
            document.removeEventListener('mouseup', onUp, true)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
          }
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
          document.addEventListener('mousemove', onMove, true)
          document.addEventListener('mouseup', onUp, true)
        }}
      />
    </span>
  )
}

export function readStoredColumnWidths<T extends string>(storageKey: string, defaults: Record<T, number>): Record<T, number> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out = { ...defaults }
    for (const k of Object.keys(defaults) as T[]) {
      const v = parsed[k]
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    }
    return out
  } catch {
    return { ...defaults }
  }
}
