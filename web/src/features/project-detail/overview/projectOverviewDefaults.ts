import type { ProjectSummary } from '../../../entities/project/model/types'
import type { ProjectOverviewInfo } from './overviewTypes'

export function getDefaultProjectOverviewInfo(project: ProjectSummary): ProjectOverviewInfo {
  return {
    title: project.title,
    owner: '—',
    startDate: '—',
    endDate: '—',
    description: '',
    progressStatus: '未开始',
    healthStatus: '正常',
    statusDescription: '—'
  }
}
