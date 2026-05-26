export const PROJECT_PERMISSION_SECTIONS = [
  {
    key: 'project',
    title: '项目权限',
    items: ['成员管理', '角色管理', '任务类型', '基本设置', '修改项目状态', '管理项目附件', '归档项目', '删除项目'],
  },
  {
    key: 'target',
    title: '目标管理',
    items: ['新建目标', '编辑目标', '删除目标', '任务关联', '管理附件', '修改目标状态'],
  },
  {
    key: 'task',
    title: '任务管理',
    items: ['新建任务', '编辑任务', '删除任务', '管理附件', '修改任务状态'],
  },
] as const

export type MappedProjectPermissionKey = `${(typeof PROJECT_PERMISSION_SECTIONS)[number]['title']}::${(typeof PROJECT_PERMISSION_SECTIONS)[number]['items'][number]}`

export const buildProjectPermissionKey = (sectionTitle: string, item: string) => `${sectionTitle}::${item}`

export const allProjectPermissionKeys = () => PROJECT_PERMISSION_SECTIONS.flatMap((s) => s.items.map((item) => buildProjectPermissionKey(s.title, item)))

