import { Form, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectSummary } from '../../../entities/project/model/types'
import { isBackendPersonalDeskProjectId } from '../../../entities/project/lib/personalDesk'
import type { TargetCommentRecord } from '../../../entities/target-feed/model/useTargetFeedStore'
import { useBackendDataStore } from '../../../entities/workspace/model/backendDataStore'
import { fetchProjectDetail, patchProject } from '../../../shared/api/projectsApi'
import { fetchProjectWorkspace, patchProjectWorkspace, type ProjectWorkspaceClientPayload } from '../../../shared/api/projectWorkspaceApi'
import { getDefaultProjectOverviewInfo, parseProjectOverviewReminderRows, formatDateText, PROJECT_OVERVIEW_ACTIVITY_PAGE_SIZE, type ProjectOverviewInfo, type ProjectOverviewAttachmentItem, type ProjectOverviewReminderRow } from '../overview'
import { formatActivityLogDate } from '../tasks/projectTaskAdapter'
import { parseDateValue } from '../overview/projectOverviewDisplayUtils'
import { parseWorkspaceTargetRelatedTasks, parseWorkspaceTargetAttachments, parseWorkspaceTaskAttachments, type TargetRelatedTaskLink, type WorkspaceAttachmentItem } from '../workspace/parseWorkspacePayload'

export type { TargetRelatedTaskLink, WorkspaceAttachmentItem }
export type WorkspaceActivityRecord = {
  id: string
  actor: string
  targetTitle: string
  fieldLabel: string
  before: string
  after: string
  createdAt: string
}

export type ProjectDetailWorkspaceMemberRef = {
  key: string
  name: string
}

export type UseProjectDetailWorkspaceParams = {
  project: ProjectSummary
  authedUserId: string | null | undefined
  members: ProjectDetailWorkspaceMemberRef[]
  onUpdateProject?: (project: ProjectSummary) => void
  /** 本地 workspace 保存成功后回传服务端 revision，供协作轮询去重 */
  onServerRevision?: (updatedAt: string) => void
  /** 即将发起本地 workspace 保存时调用，避免轮询误报「其他成员」 */
  onLocalMutation?: () => void
  ensureProjectEditable: () => boolean
  hasMappedProjectPermission: (section: string, key: string) => boolean
}

export function useProjectDetailWorkspace({
  project,
  authedUserId,
  members,
  onUpdateProject,
  onServerRevision,
  onLocalMutation,
  ensureProjectEditable,
  hasMappedProjectPermission
}: UseProjectDetailWorkspaceParams) {
  const [projectAttachments, setProjectAttachments] = useState<ProjectOverviewAttachmentItem[]>([])
  const [, setIsProjectAttachmentsHydrated] = useState(false)
  const [projectOverviewActivityRecords, setProjectOverviewActivityRecords] = useState<WorkspaceActivityRecord[]>([])
  const [overviewActivityVisibleCount, setOverviewActivityVisibleCount] = useState(PROJECT_OVERVIEW_ACTIVITY_PAGE_SIZE)
  const [isProjectOverviewActivitiesHydrated, setIsProjectOverviewActivitiesHydrated] = useState(false)
  const [editingOverviewField, setEditingOverviewField] = useState<'title' | 'owner' | 'startDate' | 'endDate' | 'description' | null>(null)
  const [overviewTitleDraft, setOverviewTitleDraft] = useState('')
  const [overviewDescriptionDraft, setOverviewDescriptionDraft] = useState('')
  const [isEditingStatusDescription, setIsEditingStatusDescription] = useState(false)
  const [overviewStatusDescriptionDraft, setOverviewStatusDescriptionDraft] = useState('')
  const [isOverviewHydrated, setIsOverviewHydrated] = useState(false)
  const [projectOverview, setProjectOverview] = useState<ProjectOverviewInfo>(() => getDefaultProjectOverviewInfo(project))
  const [projectOverviewReminders, setProjectOverviewReminders] = useState<ProjectOverviewReminderRow[]>([])
  const [isProjectOverviewRemindersHydrated, setIsProjectOverviewRemindersHydrated] = useState(false)
  const [overviewReminderSettingsOpen, setOverviewReminderSettingsOpen] = useState(false)
  const [overviewReminderEditorOpen, setOverviewReminderEditorOpen] = useState(false)
  const [overviewReminderEditingId, setOverviewReminderEditingId] = useState<string | null>(null)
  const [overviewReminderForm] = Form.useForm()

  const [workspaceFeedSeed, setWorkspaceFeedSeed] = useState(0)
  const [feedSeedActivity, setFeedSeedActivity] = useState<Record<string, WorkspaceActivityRecord[]>>({})
  const [feedSeedComments, setFeedSeedComments] = useState<Record<string, TargetCommentRecord[]>>({})

  const [targetRelatedTasksByKey, setTargetRelatedTasksByKey] = useState<Record<string, TargetRelatedTaskLink[]>>({})
  const [isTargetRelatedHydrated, setIsTargetRelatedHydrated] = useState(false)
  const [targetAttachmentsByKey, setTargetAttachmentsByKey] = useState<Record<string, WorkspaceAttachmentItem[]>>({})
  const [isTargetAttachmentsHydrated, setIsTargetAttachmentsHydrated] = useState(false)
  const [taskAttachmentsByKey, setTaskAttachmentsByKey] = useState<Record<string, WorkspaceAttachmentItem[]>>({})
  const [isTaskAttachmentsHydrated, setIsTaskAttachmentsHydrated] = useState(false)
  const [taskParticipantsByKey, setTaskParticipantsByKey] = useState<Record<string, string[]>>({})
  const [isTaskParticipantsHydrated, setIsTaskParticipantsHydrated] = useState(false)

  const prevProjectOverviewRef = useRef<ProjectOverviewInfo | null>(null)

  const overviewActivityActorName = useMemo(() => {
    if (!authedUserId) return (projectOverview.owner || '').trim() || '用户'
    const fromMember = members.find(m => m.key === authedUserId)?.name?.trim()
    if (fromMember) return fromMember
    return (projectOverview.owner || '').trim() || authedUserId
  }, [authedUserId, members, projectOverview.owner])

  const workspaceFlushTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const workspacePatchInFlightRef = useRef(false)
  const workspacePatchQueuedRef = useRef(false)
  /** 与上次成功保存/从服务端灌入的 payload 一致时不 PATCH，避免加载与协作同步引发请求风暴 */
  const lastPersistedWorkspacePayloadRef = useRef<string | null>(null)
  const applyingRemoteRef = useRef(false)

  const serializeWorkspacePayload = useCallback((payload: ProjectWorkspaceClientPayload) => JSON.stringify(payload), [])

  const cancelPendingWorkspaceFlush = useCallback(() => {
    if (workspaceFlushTimerRef.current) {
      window.clearTimeout(workspaceFlushTimerRef.current)
      workspaceFlushTimerRef.current = null
    }
  }, [])
  const projectOverviewForWorkspaceRef = useRef(projectOverview)
  const projectAttachmentsForWorkspaceRef = useRef(projectAttachments)
  const projectOverviewActivitiesForWorkspaceRef = useRef(projectOverviewActivityRecords)
  const feedActivityForWorkspaceRef = useRef<Record<string, WorkspaceActivityRecord[]>>({})
  const feedCommentsForWorkspaceRef = useRef<Record<string, TargetCommentRecord[]>>({})
  const targetRelatedTasksForWorkspaceRef = useRef<Record<string, TargetRelatedTaskLink[]>>({})
  const targetAttachmentsForWorkspaceRef = useRef<Record<string, WorkspaceAttachmentItem[]>>({})
  const taskAttachmentsForWorkspaceRef = useRef<Record<string, WorkspaceAttachmentItem[]>>({})
  const taskParticipantsForWorkspaceRef = useRef<Record<string, string[]>>({})
  const projectOverviewRemindersForWorkspaceRef = useRef<ProjectOverviewReminderRow[]>([])

  useEffect(() => {
    projectOverviewForWorkspaceRef.current = projectOverview
  }, [projectOverview])
  useEffect(() => {
    projectAttachmentsForWorkspaceRef.current = projectAttachments
  }, [projectAttachments])
  useEffect(() => {
    projectOverviewActivitiesForWorkspaceRef.current = projectOverviewActivityRecords
  }, [projectOverviewActivityRecords])
  useEffect(() => {
    targetRelatedTasksForWorkspaceRef.current = targetRelatedTasksByKey
  }, [targetRelatedTasksByKey])
  useEffect(() => {
    targetAttachmentsForWorkspaceRef.current = targetAttachmentsByKey
  }, [targetAttachmentsByKey])
  useEffect(() => {
    taskAttachmentsForWorkspaceRef.current = taskAttachmentsByKey
  }, [taskAttachmentsByKey])
  useEffect(() => {
    taskParticipantsForWorkspaceRef.current = taskParticipantsByKey
  }, [taskParticipantsByKey])
  useEffect(() => {
    projectOverviewRemindersForWorkspaceRef.current = projectOverviewReminders
  }, [projectOverviewReminders])

  const buildWorkspacePatchPayload = useCallback((): ProjectWorkspaceClientPayload => {
    const ov = projectOverviewForWorkspaceRef.current
    const startDateIso = parseDateValue(ov.startDate)?.format('YYYY-MM-DD') ?? ''
    const endDateIso = parseDateValue(ov.endDate)?.format('YYYY-MM-DD') ?? ''
    return {
      overview: {
        owner: ov.owner,
        startDate: startDateIso,
        endDate: endDateIso,
        description: ov.description,
        progressStatus: ov.progressStatus,
        healthStatus: ov.healthStatus,
        statusDescription: ov.statusDescription,
        overviewReminders: projectOverviewRemindersForWorkspaceRef.current
      },
      attachments: projectAttachmentsForWorkspaceRef.current,
      overviewActivities: projectOverviewActivitiesForWorkspaceRef.current,
      activityByKey: feedActivityForWorkspaceRef.current,
      commentsByKey: feedCommentsForWorkspaceRef.current,
      taskParticipantsByKey: taskParticipantsForWorkspaceRef.current,
      taskAttachmentsByKey: taskAttachmentsForWorkspaceRef.current as unknown as Record<string, unknown[]>,
      targetRelatedTasksByKey: targetRelatedTasksForWorkspaceRef.current as unknown as Record<string, unknown[]>,
      targetAttachmentsByKey: targetAttachmentsForWorkspaceRef.current as unknown as Record<string, unknown[]>
    }
  }, [])

  const commitPersistedWorkspaceSnapshot = useCallback(() => {
    lastPersistedWorkspacePayloadRef.current = serializeWorkspacePayload(buildWorkspacePatchPayload())
  }, [buildWorkspacePatchPayload, serializeWorkspacePayload])

  const executeWorkspacePatch = useCallback(() => {
    const payload = buildWorkspacePatchPayload()
    const serialized = serializeWorkspacePayload(payload)
    if (serialized === lastPersistedWorkspacePayloadRef.current) return
    if (workspacePatchInFlightRef.current) {
      workspacePatchQueuedRef.current = true
      return
    }
    workspacePatchInFlightRef.current = true
    onLocalMutation?.()
    void patchProjectWorkspace(project.id, payload)
      .then(r => {
        if (!r.ok) {
          if (r.message !== '请求已取消') {
            message.error({ content: r.message, key: 'pm-workspace-patch' })
          }
          return
        }
        lastPersistedWorkspacePayloadRef.current = serialized
        useBackendDataStore.setState(s => ({
          workspacePayloadByProject: { ...s.workspacePayloadByProject, [project.id]: payload }
        }))
        void fetchProjectDetail(project.id).then(d => {
          if (d.ok) onServerRevision?.(d.data.updatedAt)
        })
        if (isBackendPersonalDeskProjectId(project.id)) {
          void useBackendDataStore.getState().refreshProject(project.id)
        }
      })
      .catch(err => {
        console.warn('[workspace] patch failed', err)
        message.error({ content: '网络异常，工作区保存失败', key: 'pm-workspace-patch' })
      })
      .finally(() => {
        workspacePatchInFlightRef.current = false
        if (workspacePatchQueuedRef.current) {
          workspacePatchQueuedRef.current = false
          executeWorkspacePatch()
        }
      })
  }, [buildWorkspacePatchPayload, project.id, onServerRevision, onLocalMutation, serializeWorkspacePayload])

  const flushWorkspaceNow = useCallback(() => {
    cancelPendingWorkspaceFlush()
    executeWorkspacePatch()
  }, [cancelPendingWorkspaceFlush, executeWorkspacePatch])

  const scheduleWorkspaceFlush = useCallback(() => {
    cancelPendingWorkspaceFlush()
    const payload = buildWorkspacePatchPayload()
    if (serializeWorkspacePayload(payload) === lastPersistedWorkspacePayloadRef.current) return
    workspaceFlushTimerRef.current = window.setTimeout(() => {
      workspaceFlushTimerRef.current = null
      executeWorkspacePatch()
    }, 900)
  }, [buildWorkspacePatchPayload, cancelPendingWorkspaceFlush, executeWorkspacePatch, serializeWorkspacePayload])

  const syncTaskParticipantsPatchToBackend = useCallback(
    (delta: Record<string, string[]>) => {
      onLocalMutation?.()
      void patchProjectWorkspace(project.id, { taskParticipantsByKey: delta })
        .then(res => {
          if (!res.ok) {
            message.error(res.message)
            return
          }
          void fetchProjectDetail(project.id).then(d => {
            if (d.ok) onServerRevision?.(d.data.updatedAt)
          })
          if (isBackendPersonalDeskProjectId(project.id)) {
            void useBackendDataStore.getState().refreshProject(project.id)
          }
        })
        .catch(() => {
          message.error('网络异常，参与人保存失败')
        })
    },
    [project.id, onServerRevision, onLocalMutation]
  )

  const appendOverviewActivityEntries = useCallback(
    (entries: Array<{ fieldLabel: string; before: string; after: string; actor?: string; targetTitle?: string }>) => {
      if (entries.length === 0) return
      const actorDefault = overviewActivityActorName
      const ts = new Date().toISOString()
      const title = projectOverviewForWorkspaceRef.current.title
      const newItems: WorkspaceActivityRecord[] = entries.map((e, i) => ({
        id: `ov-${ts}-${i}-${Math.random().toString(36).slice(2, 9)}`,
        actor: e.actor ?? actorDefault,
        targetTitle: e.targetTitle ?? title,
        fieldLabel: e.fieldLabel,
        before: e.before,
        after: e.after,
        createdAt: ts
      }))
      setProjectOverviewActivityRecords(records => {
        const next = [...newItems, ...records].slice(0, 120)
        projectOverviewActivitiesForWorkspaceRef.current = next
        return next
      })
    },
    [overviewActivityActorName]
  )

  const finishOverviewDescriptionEdit = useCallback(() => {
    const trimmed = overviewDescriptionDraft.trim() ? overviewDescriptionDraft.trim() : '无'
    setProjectOverview(prev => {
      const next = { ...prev, description: trimmed }
      projectOverviewForWorkspaceRef.current = next
      return next
    })
    setEditingOverviewField(null)
    flushWorkspaceNow()
  }, [overviewDescriptionDraft, flushWorkspaceNow])

  const finishOverviewTitleEdit = useCallback(() => {
    const trimmed = overviewTitleDraft.trim()
    const nextTitle = trimmed || project.title

    if (nextTitle === projectOverview.title) {
      setEditingOverviewField(null)
      return
    }

    if (!ensureProjectEditable()) {
      setEditingOverviewField(null)
      return
    }
    if (!hasMappedProjectPermission('项目权限', '基本设置')) {
      message.warning('当前角色暂无「基本设置」权限')
      setEditingOverviewField(null)
      return
    }

    const prevTitle = projectOverview.title
    setProjectOverview(prev => {
      const next = { ...prev, title: nextTitle }
      projectOverviewForWorkspaceRef.current = next
      prevProjectOverviewRef.current = next
      return next
    })
    setEditingOverviewField(null)
    appendOverviewActivityEntries([{ fieldLabel: '项目标题', before: prevTitle || '无', after: nextTitle }])
    flushWorkspaceNow()

    if (nextTitle !== project.title) {
      void patchProject(project.id, { title: nextTitle })
        .then(res => {
          if (!res.ok) {
            message.error(res.message)
            setProjectOverview(prev => ({ ...prev, title: project.title }))
            return
          }
          const d = res.data
          onUpdateProject?.({
            ...project,
            title: d.title,
            backendVisibility: d.visibility === 'public' ? 'public' : 'private',
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            cover: d.coverKind === 'image' ? 'image' : 'gradient',
            image: d.coverImageData ?? undefined
          })
        })
        .catch(() => {
          message.error('网络异常，项目名称保存失败')
          setProjectOverview(prev => ({ ...prev, title: project.title }))
        })
    }
  }, [
    overviewTitleDraft,
    project,
    projectOverview.title,
    ensureProjectEditable,
    hasMappedProjectPermission,
    appendOverviewActivityEntries,
    flushWorkspaceNow,
    onUpdateProject
  ])

  const onBeginEditStatusDescription = useCallback(() => {
    setOverviewStatusDescriptionDraft(projectOverview.statusDescription)
    setIsEditingStatusDescription(true)
  }, [projectOverview.statusDescription])

  const finishOverviewStatusDescriptionEdit = useCallback(() => {
    const trimmed = overviewStatusDescriptionDraft.trim() || '无'
    setIsEditingStatusDescription(false)
    setProjectOverview(prev => {
      const next = { ...prev, statusDescription: trimmed }
      projectOverviewForWorkspaceRef.current = next
      return next
    })
    flushWorkspaceNow()
  }, [overviewStatusDescriptionDraft, flushWorkspaceNow])

  const commitOverviewStatusField = useCallback(
    (patch: Partial<Pick<ProjectOverviewInfo, 'progressStatus' | 'healthStatus'>>) => {
      setProjectOverview(prev => {
        const next = { ...prev, ...patch }
        projectOverviewForWorkspaceRef.current = next
        return next
      })
      flushWorkspaceNow()
    },
    [flushWorkspaceNow]
  )

  const commitOverviewOwner = useCallback(
    (owner: string) => {
      setProjectOverview(prev => {
        const next = { ...prev, owner }
        projectOverviewForWorkspaceRef.current = next
        return next
      })
      flushWorkspaceNow()
    },
    [flushWorkspaceNow]
  )

  const workspaceFeedPersistence = useMemo(
    () => ({
      seedKey: workspaceFeedSeed,
      initialActivity: feedSeedActivity,
      initialComments: feedSeedComments,
      onPersist: (next: { activityByKey: Record<string, WorkspaceActivityRecord[]>; commentsByKey: Record<string, TargetCommentRecord[]> }) => {
        feedActivityForWorkspaceRef.current = next.activityByKey
        feedCommentsForWorkspaceRef.current = next.commentsByKey
        scheduleWorkspaceFlush()
      }
    }),
    [workspaceFeedSeed, feedSeedActivity, feedSeedComments, scheduleWorkspaceFlush]
  )

  const applyWorkspacePayload = useCallback(
    (w: ProjectWorkspaceClientPayload, opts?: { fromRemote?: boolean }) => {
      if (opts?.fromRemote) applyingRemoteRef.current = true
      const base = getDefaultProjectOverviewInfo(project)
      const ov = (w.overview || {}) as Record<string, unknown>
      const str = (k: string, fallback: string) => (typeof ov[k] === 'string' ? (ov[k] as string) : fallback)
      const ps = str('progressStatus', base.progressStatus)
      const hs = str('healthStatus', base.healthStatus)
      const nextOverview: ProjectOverviewInfo = {
        ...base,
        title: project.title,
        owner: str('owner', base.owner),
        startDate: formatDateText(str('startDate', base.startDate)),
        endDate: formatDateText(str('endDate', base.endDate)),
        description: str('description', base.description),
        progressStatus: (['未开始', '进行中', '验收中', '已完成', '关闭'].includes(ps) ? ps : base.progressStatus) as ProjectOverviewInfo['progressStatus'],
        healthStatus: (['正常', '有风险', '失控'].includes(hs) ? hs : base.healthStatus) as ProjectOverviewInfo['healthStatus'],
        statusDescription: str('statusDescription', base.statusDescription)
      }
      projectOverviewForWorkspaceRef.current = nextOverview
      setProjectOverview(nextOverview)
      if (opts?.fromRemote) prevProjectOverviewRef.current = nextOverview
      const nextReminders = parseProjectOverviewReminderRows(ov.overviewReminders)
      projectOverviewRemindersForWorkspaceRef.current = nextReminders
      setProjectOverviewReminders(nextReminders)
      setIsProjectOverviewRemindersHydrated(true)
      const nextAttachments = Array.isArray(w.attachments) ? (w.attachments as ProjectOverviewAttachmentItem[]) : []
      projectAttachmentsForWorkspaceRef.current = nextAttachments
      setProjectAttachments(nextAttachments)
      const nextOverviewActivities = Array.isArray(w.overviewActivities) ? (w.overviewActivities as WorkspaceActivityRecord[]) : []
      projectOverviewActivitiesForWorkspaceRef.current = nextOverviewActivities
      setProjectOverviewActivityRecords(nextOverviewActivities)
      const act = (w.activityByKey || {}) as Record<string, WorkspaceActivityRecord[]>
      const com = (w.commentsByKey || {}) as Record<string, TargetCommentRecord[]>
      feedActivityForWorkspaceRef.current = JSON.parse(JSON.stringify(act)) as Record<string, WorkspaceActivityRecord[]>
      feedCommentsForWorkspaceRef.current = JSON.parse(JSON.stringify(com)) as Record<string, TargetCommentRecord[]>
      setFeedSeedActivity(act)
      setFeedSeedComments(com)
      setWorkspaceFeedSeed(s => s + 1)
      const nextTargetRelated = parseWorkspaceTargetRelatedTasks(w.targetRelatedTasksByKey)
      targetRelatedTasksForWorkspaceRef.current = nextTargetRelated
      setTargetRelatedTasksByKey(nextTargetRelated)
      const nextTargetAttachments = parseWorkspaceTargetAttachments(w.targetAttachmentsByKey)
      targetAttachmentsForWorkspaceRef.current = nextTargetAttachments
      setTargetAttachmentsByKey(nextTargetAttachments)
      const nextTaskAttachments = parseWorkspaceTaskAttachments(w.taskAttachmentsByKey)
      taskAttachmentsForWorkspaceRef.current = nextTaskAttachments
      setTaskAttachmentsByKey(nextTaskAttachments)
      const tpRaw = w.taskParticipantsByKey
      let nextTp: Record<string, string[]> = {}
      if (tpRaw && typeof tpRaw === 'object' && !Array.isArray(tpRaw)) {
        for (const [k, v] of Object.entries(tpRaw)) {
          if (Array.isArray(v)) nextTp[k] = v.filter((x): x is string => typeof x === 'string')
        }
      }
      taskParticipantsForWorkspaceRef.current = nextTp
      setTaskParticipantsByKey(nextTp)
      setIsOverviewHydrated(true)
      setIsProjectAttachmentsHydrated(true)
      setIsProjectOverviewActivitiesHydrated(true)
      setIsTargetRelatedHydrated(true)
      setIsTargetAttachmentsHydrated(true)
      setIsTaskParticipantsHydrated(true)
      setIsTaskAttachmentsHydrated(true)
      commitPersistedWorkspaceSnapshot()
      if (opts?.fromRemote) {
        cancelPendingWorkspaceFlush()
        window.setTimeout(() => {
          applyingRemoteRef.current = false
        }, 0)
      }
    },
    [project, commitPersistedWorkspaceSnapshot, cancelPendingWorkspaceFlush]
  )

  const hasPendingWorkspaceSave = useCallback(
    () => workspaceFlushTimerRef.current !== null || workspacePatchInFlightRef.current,
    []
  )

  const reloadWorkspaceFromServer = useCallback(async (): Promise<boolean> => {
    if (workspaceFlushTimerRef.current || workspacePatchInFlightRef.current) return false
    const res = await fetchProjectWorkspace(project.id)
    if (!res.ok) return false
    useBackendDataStore.setState(s => ({
      workspacePayloadByProject: { ...s.workspacePayloadByProject, [project.id]: res.data }
    }))
    applyWorkspacePayload(res.data, { fromRemote: true })
    return true
  }, [applyWorkspacePayload, project.id])

  useEffect(() => {
    let cancel = false
    lastPersistedWorkspacePayloadRef.current = null
    cancelPendingWorkspaceFlush()
    prevProjectOverviewRef.current = null
    setIsOverviewHydrated(false)
    setIsProjectOverviewRemindersHydrated(false)
    setIsProjectAttachmentsHydrated(false)
    setIsProjectOverviewActivitiesHydrated(false)
    setIsTargetRelatedHydrated(false)
    setIsTargetAttachmentsHydrated(false)
    setTargetRelatedTasksByKey({})
    setTargetAttachmentsByKey({})
    setTaskAttachmentsByKey({})

    const markWorkspaceEmpty = () => {
      setIsOverviewHydrated(true)
      setIsProjectAttachmentsHydrated(true)
      setIsProjectOverviewActivitiesHydrated(true)
      setTargetRelatedTasksByKey({})
      setTargetAttachmentsByKey({})
      setIsTargetRelatedHydrated(true)
      setIsTargetAttachmentsHydrated(true)
      setTaskParticipantsByKey({})
      setTaskAttachmentsByKey({})
      setIsTaskParticipantsHydrated(true)
      setIsTaskAttachmentsHydrated(true)
      setProjectOverviewReminders([])
      setIsProjectOverviewRemindersHydrated(true)
    }

    const cached = useBackendDataStore.getState().workspacePayloadByProject[project.id]
    if (cached) {
      applyWorkspacePayload(cached)
      return () => {
        cancel = true
      }
    }

    void (async () => {
      const res = await fetchProjectWorkspace(project.id)
      if (cancel) return
      if (!res.ok) {
        markWorkspaceEmpty()
        return
      }
      useBackendDataStore.setState(s => ({
        workspacePayloadByProject: { ...s.workspacePayloadByProject, [project.id]: res.data }
      }))
      applyWorkspacePayload(res.data)
    })()
    return () => {
      cancel = true
    }
  }, [project.id, project.templateId, applyWorkspacePayload, cancelPendingWorkspaceFlush])

  useEffect(() => {
    if (applyingRemoteRef.current) return
    if (!isOverviewHydrated) return
    if (!isTargetRelatedHydrated || !isTargetAttachmentsHydrated) return
    if (!isTaskParticipantsHydrated) return
    if (!isTaskAttachmentsHydrated) return
    if (!isProjectOverviewRemindersHydrated) return
    const payload = buildWorkspacePatchPayload()
    if (serializeWorkspacePayload(payload) === lastPersistedWorkspacePayloadRef.current) return
    scheduleWorkspaceFlush()
  }, [
    projectOverview,
    projectOverviewReminders,
    projectAttachments,
    projectOverviewActivityRecords,
    targetRelatedTasksByKey,
    targetAttachmentsByKey,
    taskAttachmentsByKey,
    taskParticipantsByKey,
    isOverviewHydrated,
    isTargetRelatedHydrated,
    isTargetAttachmentsHydrated,
    isTaskParticipantsHydrated,
    isTaskAttachmentsHydrated,
    isProjectOverviewRemindersHydrated,
    scheduleWorkspaceFlush,
    buildWorkspacePatchPayload,
    serializeWorkspacePayload
  ])

  /** 仅随服务端 project.title 变化同步；勿在结束标题编辑时把本地新标题盖回旧值 */
  useEffect(() => {
    setProjectOverview(prev => (prev.title === project.title ? prev : { ...prev, title: project.title }))
  }, [project.title])

  useEffect(() => {
    setOverviewActivityVisibleCount(PROJECT_OVERVIEW_ACTIVITY_PAGE_SIZE)
  }, [project.id])

  useEffect(() => {
    if (applyingRemoteRef.current) return
    if (!isOverviewHydrated || !isProjectOverviewActivitiesHydrated) return
    if (!prevProjectOverviewRef.current) {
      prevProjectOverviewRef.current = projectOverview
      return
    }
    const prev = prevProjectOverviewRef.current
    const fieldLabels: Record<Exclude<keyof ProjectOverviewInfo, 'title'>, string> = {
      owner: '负责人',
      startDate: '开始时间',
      endDate: '截止时间',
      description: '描述',
      progressStatus: '项目状态',
      healthStatus: '健康度',
      statusDescription: '状态描述'
    }
    const changed = (Object.keys(fieldLabels) as (keyof typeof fieldLabels)[])
      .filter(k => (prev[k] ?? '') !== (projectOverview[k] ?? ''))
      .map(k => ({
        id: `po-${String(k)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actor: overviewActivityActorName,
        targetTitle: projectOverview.title,
        fieldLabel: fieldLabels[k],
        before: k === 'startDate' || k === 'endDate' ? formatActivityLogDate(String(prev[k] ?? '')) : String(prev[k] ?? '无'),
        after: k === 'startDate' || k === 'endDate' ? formatActivityLogDate(String(projectOverview[k] ?? '')) : String(projectOverview[k] ?? '无'),
        createdAt: new Date().toISOString()
      }))
    if (changed.length) {
      setProjectOverviewActivityRecords(records => {
        const next = [...changed, ...records].slice(0, 120)
        projectOverviewActivitiesForWorkspaceRef.current = next
        return next
      })
    }
    prevProjectOverviewRef.current = projectOverview
  }, [projectOverview, isOverviewHydrated, isProjectOverviewActivitiesHydrated, overviewActivityActorName])

  const visibleProjectOverviewActivityRecords = useMemo(() => projectOverviewActivityRecords.slice(0, overviewActivityVisibleCount), [projectOverviewActivityRecords, overviewActivityVisibleCount])
  const hasMoreProjectOverviewActivity = projectOverviewActivityRecords.length > overviewActivityVisibleCount

  const overviewReminderAnchorDatesReady = useMemo(() => {
    const s = parseDateValue(projectOverview.startDate)
    const e = parseDateValue(projectOverview.endDate)
    return Boolean(s?.isValid() && e?.isValid())
  }, [projectOverview.startDate, projectOverview.endDate])

  return {
    projectOverview,
    setProjectOverview,
    projectOverviewReminders,
    setProjectOverviewReminders,
    projectAttachments,
    setProjectAttachments,
    projectOverviewActivityRecords,
    setProjectOverviewActivityRecords,
    overviewActivityVisibleCount,
    setOverviewActivityVisibleCount,
    visibleProjectOverviewActivityRecords,
    hasMoreProjectOverviewActivity,
    isOverviewHydrated,
    isProjectOverviewRemindersHydrated,
    isProjectOverviewActivitiesHydrated,
    editingOverviewField,
    setEditingOverviewField,
    overviewTitleDraft,
    setOverviewTitleDraft,
    finishOverviewTitleEdit,
    overviewDescriptionDraft,
    setOverviewDescriptionDraft,
    isEditingStatusDescription,
    setIsEditingStatusDescription,
    overviewStatusDescriptionDraft,
    setOverviewStatusDescriptionDraft,
    onBeginEditStatusDescription,
    finishOverviewStatusDescriptionEdit,
    commitOverviewStatusField,
    commitOverviewOwner,
    overviewReminderSettingsOpen,
    setOverviewReminderSettingsOpen,
    overviewReminderEditorOpen,
    setOverviewReminderEditorOpen,
    overviewReminderEditingId,
    setOverviewReminderEditingId,
    overviewReminderForm,
    overviewReminderAnchorDatesReady,
    overviewActivityActorName,
    appendOverviewActivityEntries,
    finishOverviewDescriptionEdit,
    flushWorkspaceNow,
    scheduleWorkspaceFlush,
    hasPendingWorkspaceSave,
    reloadWorkspaceFromServer,
    syncTaskParticipantsPatchToBackend,
    workspaceFeedPersistence,
    targetRelatedTasksByKey,
    setTargetRelatedTasksByKey,
    isTargetRelatedHydrated,
    targetAttachmentsByKey,
    setTargetAttachmentsByKey,
    isTargetAttachmentsHydrated,
    taskAttachmentsByKey,
    setTaskAttachmentsByKey,
    isTaskAttachmentsHydrated,
    taskParticipantsByKey,
    setTaskParticipantsByKey,
    isTaskParticipantsHydrated
  }
}
