import { Tooltip } from 'antd'
import type { ReactNode } from 'react'

export type PrimaryNavItemProps = {
  active: boolean
  label: string
  icon: ReactNode
  collapsed: boolean
  onClick: () => void
}

export function PrimaryNavItem({ active, label, icon, collapsed, onClick }: PrimaryNavItemProps) {
  const className = active ? 'wt-primary-nav__item wt-primary-nav__item--active' : 'wt-primary-nav__item'
  const item = (
    <div className={className} onClick={onClick}>
      {icon}
      <span className="wt-primary-nav__item-label">{label}</span>
    </div>
  )
  if (!collapsed) return item
  return (
    <Tooltip title={label} placement="right" mouseEnterDelay={0.2}>
      {item}
    </Tooltip>
  )
}
