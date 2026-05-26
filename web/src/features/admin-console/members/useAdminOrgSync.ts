import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureDepartmentsContainMembers } from '../../../entities/org/lib/contactsStore'
import type { OrgDepartmentNode, OrgMember } from '../../../entities/org/model/types'
import {
  adminMemberDtoToOrg,
  fetchAdminDepartmentTree,
  fetchAdminMembers,
  mapAdminDeptTreeToOrg,
} from '../../../shared/api/adminOrgApi'

type UseAdminOrgSyncOptions = {
  /** bootstrap 已写入通讯录缓存时，不阻塞整页展示加载圈 */
  hasInitialData?: boolean
}

/** 后端模式下拉取部门树 + 成员列表并归一化为与本地一致的 Org 结构 */
export function useAdminOrgSync(enabled: boolean, options?: UseAdminOrgSyncOptions) {
  const hasInitialData = Boolean(options?.hasInitialData)
  const initialFetchDoneRef = useRef(false)
  const [loading, setLoading] = useState(() => Boolean(enabled && !hasInitialData))
  const [departments, setDepartments] = useState<OrgDepartmentNode[]>([])
  const [members, setMembers] = useState<OrgMember[]>([])
  const [reloadFlag, setReloadFlag] = useState(0)
  const reload = useCallback(() => setReloadFlag(x => x + 1), [])

  useEffect(() => {
    if (!enabled) {
      initialFetchDoneRef.current = false
      setLoading(false)
      setDepartments([])
      setMembers([])
      return
    }
    let cancel = false
    const blockUi = !initialFetchDoneRef.current && !hasInitialData
    if (blockUi) setLoading(true)
    ;(async () => {
      const [td, tm] = await Promise.all([fetchAdminDepartmentTree(), fetchAdminMembers()])
      if (cancel) return
      if (!td.ok || !tm.ok) {
        setLoading(false)
        return
      }
      const orgMembers = tm.data.map(adminMemberDtoToOrg)
      const root = mapAdminDeptTreeToOrg(td.data, orgMembers)
      const ensured = ensureDepartmentsContainMembers(orgMembers, [root])
      setDepartments(ensured)
      setMembers(orgMembers)
      initialFetchDoneRef.current = true
      setLoading(false)
    })()
    return () => {
      cancel = true
    }
  }, [enabled, hasInitialData, reloadFlag])

  return { loading, departments, members, reload }
}
