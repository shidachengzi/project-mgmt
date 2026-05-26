import type { ReactNode } from 'react'

type ProjectOverviewTabProps = {
  children: ReactNode
}

export function ProjectOverviewTab({ children }: ProjectOverviewTabProps) {
  return <>{children}</>
}
