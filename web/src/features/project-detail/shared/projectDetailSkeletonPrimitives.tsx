import type { CSSProperties } from 'react'

const WIDTHS = ['58%', '72%', '45%', '65%', '50%', '80%', '42%', '68%'] as const

export function DetailSk({
  width,
  className = '',
  style
}: {
  width?: number | string
  className?: string
  style?: CSSProperties
}) {
  const w =
    width != null ? { width: typeof width === 'number' ? `${width}px` : width, ...style } : style
  return <span className={`wt-wb-sk wt-wb-sk--line ${className}`.trim()} style={w} aria-hidden />
}

export function DetailSkPill() {
  return <span className="wt-wb-sk wt-wb-sk--pill" aria-hidden />
}

export function widthAt(index: number) {
  return WIDTHS[index % WIDTHS.length]
}
