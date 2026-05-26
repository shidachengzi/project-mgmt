import { useEffect, useMemo } from 'react'
import { useLocalStorageState } from '../../../shared/hooks/useLocalStorageState'

export type TargetActivityRecord = {
  id: string
  actor: string
  targetTitle: string
  fieldLabel: string
  before: string
  after: string
  createdAt: string
}

export type TargetCommentRecord = {
  id: string
  actor: string
  content: string
  createdAt: string
}

type TargetFeedStore = {
  activityByKey: Record<string, TargetActivityRecord[]>
  commentsByKey: Record<string, TargetCommentRecord[]>
  addComment: (targetKey: string, content: string) => void
  prependActivityRecords: (targetKey: string, records: TargetActivityRecord[]) => void
  prependActivity: (
    targetKey: string,
    entry: Omit<TargetActivityRecord, 'id' | 'actor' | 'targetTitle' | 'createdAt'> & { targetTitle?: string },
  ) => void
}

const cloneFeedMap = <T,>(x: Record<string, T[]>): Record<string, T[]> =>
  JSON.parse(JSON.stringify(x ?? {})) as Record<string, T[]>

export type RemoteFeedPersistence = {
  seedKey: number
  initialActivity: Record<string, TargetActivityRecord[]>
  initialComments: Record<string, TargetCommentRecord[]>
  onPersist: (next: { activityByKey: Record<string, TargetActivityRecord[]>; commentsByKey: Record<string, TargetCommentRecord[]> }) => void
}

type UseTargetFeedStoreArgs = {
  projectId: string
  actor: string
  resolveTargetTitle: (targetKey: string, overrideTitle?: string) => string
  remotePersistence?: RemoteFeedPersistence | null
}

export function useTargetFeedStore({
  projectId,
  actor,
  resolveTargetTitle,
  remotePersistence,
}: UseTargetFeedStoreArgs): TargetFeedStore {
  const useRemote = Boolean(remotePersistence)

  const activityLs = useLocalStorageState<Record<string, TargetActivityRecord[]>>(
    `pm-target-activity-${projectId}`,
    {},
    { merge: (prev, hydrated) => ({ ...hydrated, ...prev }), skipStorage: useRemote },
  )

  const commentsLs = useLocalStorageState<Record<string, TargetCommentRecord[]>>(
    `pm-target-comments-${projectId}`,
    {},
    { skipStorage: useRemote },
  )

  useEffect(() => {
    if (!remotePersistence) return
    activityLs.setState(() => cloneFeedMap(remotePersistence.initialActivity))
    commentsLs.setState(() => cloneFeedMap(remotePersistence.initialComments))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随 seedKey 从后端重新灌入
  }, [remotePersistence?.seedKey])

  return useMemo<TargetFeedStore>(() => {
    const persistRemote = (
      nextActivity: Record<string, TargetActivityRecord[]>,
      nextComments: Record<string, TargetCommentRecord[]>,
    ) => {
      remotePersistence?.onPersist({ activityByKey: nextActivity, commentsByKey: nextComments })
    }

    const addComment: TargetFeedStore['addComment'] = (targetKey, content) => {
      const trimmed = content.trim()
      if (!trimmed) return
      const comment: TargetCommentRecord = {
        id: `${targetKey}-comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actor,
        content: trimmed,
        createdAt: new Date().toISOString(),
      }
      commentsLs.setState(prevC => {
        const nextC = {
          ...prevC,
          [targetKey]: [comment, ...(prevC[targetKey] ?? [])],
        }
        if (useRemote) {
          activityLs.setState(prevA => {
            persistRemote(prevA, nextC)
            return prevA
          })
        }
        return nextC
      })
    }

    const prependActivityRecords: TargetFeedStore['prependActivityRecords'] = (targetKey, records) => {
      if (!records.length) return
      activityLs.setState(prevA => {
        const nextA = {
          ...prevA,
          [targetKey]: [...records, ...(prevA[targetKey] ?? [])],
        }
        if (useRemote) {
          commentsLs.setState(prevC => {
            persistRemote(nextA, prevC)
            return prevC
          })
        }
        return nextA
      })
    }

    const prependActivity: TargetFeedStore['prependActivity'] = (targetKey, entry) => {
      const targetTitle = resolveTargetTitle(targetKey, entry.targetTitle)
      const rec: TargetActivityRecord = {
        id: `${targetKey}-act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        actor,
        targetTitle,
        fieldLabel: entry.fieldLabel,
        before: entry.before,
        after: entry.after,
        createdAt: new Date().toISOString(),
      }
      activityLs.setState(prevA => {
        const nextA = {
          ...prevA,
          [targetKey]: [rec, ...(prevA[targetKey] ?? [])],
        }
        if (useRemote) {
          commentsLs.setState(prevC => {
            persistRemote(nextA, prevC)
            return prevC
          })
        }
        return nextA
      })
    }

    return {
      activityByKey: activityLs.state,
      commentsByKey: commentsLs.state,
      addComment,
      prependActivityRecords,
      prependActivity,
    }
  }, [activityLs.state, activityLs.setState, actor, commentsLs.state, commentsLs.setState, resolveTargetTitle, useRemote])
}
