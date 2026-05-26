import type { ProjectTemplateId } from '../config/projectTemplates'

export type ProjectSummary = {
  id: string
  title: string
  cover: 'gradient' | 'image'
  image?: string
  templateId: ProjectTemplateId
  isPreset?: boolean
  backendVisibility?: 'public' | 'private'
  backendArchived?: boolean
  backendProgressStatus?: '未开始' | '进行中' | '验收中' | '已完成' | '关闭'
  createdAt?: string
  updatedAt?: string
  backendOwnerUserId?: string | null
}
