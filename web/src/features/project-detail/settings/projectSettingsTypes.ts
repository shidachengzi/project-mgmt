import dayjs from 'dayjs'

export type ProjectSettingsMeta = {
  owner: string
  startDate: string
  endDate: string
  description: string
  progressStatus: '未开始' | '进行中' | '验收中' | '已完成' | '关闭'
  healthStatus: '正常' | '有风险' | '失控'
  statusDescription: string
  visibility: '公开（企业所有成员）' | '私有（仅加入的项目成员）'
}

export const DEFAULT_PROJECT_SETTINGS_META: ProjectSettingsMeta = {
  owner: '—',
  startDate: dayjs().format('YYYY-MM-DD'),
  endDate: dayjs().format('YYYY-MM-DD'),
  description: '',
  progressStatus: '未开始',
  healthStatus: '正常',
  statusDescription: '—',
  visibility: '公开（企业所有成员）'
}

export type ProjectSettingsFormValues = {
  title: string
  owner: string
  startDate: dayjs.Dayjs | null
  endDate: dayjs.Dayjs | null
  visibility: ProjectSettingsMeta['visibility']
  description: string
  progressStatus: ProjectSettingsMeta['progressStatus']
  healthStatus: ProjectSettingsMeta['healthStatus']
  statusDescription: string
}
