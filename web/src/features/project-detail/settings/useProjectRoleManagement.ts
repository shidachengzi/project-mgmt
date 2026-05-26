import { Form, message } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useBackendDataStore } from '../../../entities/workspace/model/backendDataStore'
import { deleteProjectRole, patchProjectDefaultRole, postProjectRole, putProjectRolePermissions } from '../../../shared/api/projectRolesApi'
import { isBackendAuthEnabled } from '../../../shared/api/backendClient'
import {
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
  DEFAULT_PROJECT_ROLES,
  isCustomProjectRoleKey,
  resolveDefaultMemberRoleKey,
  type ProjectRoleItem
} from './projectRoleDefaults'

export type BackendProjectRoleDetailed = {
  id: string
  key: string
  name: string
  note?: string | null
  isDefault: boolean
  permissionKeys: string[]
}

export type UseProjectRoleManagementParams = {
  projectId: string
  backendRolesDetailed: BackendProjectRoleDetailed[] | undefined
}

export type UseProjectRoleManagementResult = {
  projectRoles: ProjectRoleItem[]
  setProjectRoles: Dispatch<SetStateAction<ProjectRoleItem[]>>
  defaultMemberRoleKey: 'admin' | 'normal' | 'observer'
  settingsSelectedRoleKeys: string[]
  setSettingsSelectedRoleKeys: Dispatch<SetStateAction<string[]>>
  rolePermissionSaving: boolean
  roleDeleting: boolean
  roleDefaultSavingKey: string | null
  addRoleSaving: boolean
  addRoleOpen: boolean
  setAddRoleOpen: Dispatch<SetStateAction<boolean>>
  addRoleForm: FormInstance<{ name: string; note?: string }>
  rolePermissionOpen: boolean
  setRolePermissionOpen: Dispatch<SetStateAction<boolean>>
  activeRoleForPermission: string | null
  setActiveRoleForPermission: Dispatch<SetStateAction<string | null>>
  rolePermissionsByKey: Record<string, string[]>
  setRolePermissionsByKey: Dispatch<SetStateAction<Record<string, string[]>>>
  persistProjectRolePermissions: (
    roleKey: string,
    permissionKeys: string[]
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  createBackendProjectRole: (name: string, note?: string) => Promise<{ ok: true } | { ok: false; message: string }>
  setDefaultProjectRole: (roleKey: string) => Promise<{ ok: true } | { ok: false; message: string }>
  deleteSelectedCustomRoles: (roleKeys: string[]) => Promise<{ ok: true } | { ok: false; message: string }>
  isCustomProjectRoleKey: (key: string) => boolean
}

export function useProjectRoleManagement({
  projectId,
  backendRolesDetailed
}: UseProjectRoleManagementParams): UseProjectRoleManagementResult {
  const [projectRoles, setProjectRoles] = useState<ProjectRoleItem[]>(DEFAULT_PROJECT_ROLES)
  const [settingsSelectedRoleKeys, setSettingsSelectedRoleKeys] = useState<string[]>([])
  const [rolePermissionSaving, setRolePermissionSaving] = useState(false)
  const [roleDeleting, setRoleDeleting] = useState(false)
  const [roleDefaultSavingKey, setRoleDefaultSavingKey] = useState<string | null>(null)
  const [addRoleSaving, setAddRoleSaving] = useState(false)
  const [addRoleOpen, setAddRoleOpen] = useState(false)
  const [addRoleForm] = Form.useForm<{ name: string; note?: string }>()
  const [rolePermissionOpen, setRolePermissionOpen] = useState(false)
  const [activeRoleForPermission, setActiveRoleForPermission] = useState<string | null>(null)
  const [rolePermissionsByKey, setRolePermissionsByKey] = useState<Record<string, string[]>>(DEFAULT_PROJECT_ROLE_PERMISSIONS)

  const defaultMemberRoleKey = useMemo(
    () => resolveDefaultMemberRoleKey(backendRolesDetailed ?? projectRoles),
    [backendRolesDetailed, projectRoles]
  )

  useEffect(() => {
    const detailed = backendRolesDetailed
    if (detailed?.length) {
      const mergedKeys: Record<string, string[]> = { ...DEFAULT_PROJECT_ROLE_PERMISSIONS }
      detailed.forEach(r => {
        mergedKeys[r.key] = r.permissionKeys
      })
      setRolePermissionsByKey(mergedKeys)
      setProjectRoles(
        detailed.map(r => ({
          key: r.key,
          name: r.name,
          note: (r.note && String(r.note).trim()) || r.name,
          isDefault: r.isDefault
        }))
      )
    } else {
      setRolePermissionsByKey(DEFAULT_PROJECT_ROLE_PERMISSIONS)
      setProjectRoles(DEFAULT_PROJECT_ROLES)
    }
  }, [projectId, backendRolesDetailed])

  const persistProjectRolePermissions = useCallback(
    async (roleKey: string, permissionKeys: string[]) => {
      const row = backendRolesDetailed?.find(r => r.key === roleKey)
      if (!row) return { ok: false as const, message: '未找到角色' }
      setRolePermissionSaving(true)
      try {
        const res = await putProjectRolePermissions(projectId, row.id, permissionKeys)
        if (!res.ok) return { ok: false as const, message: res.message }
        setRolePermissionsByKey(prev => ({ ...prev, [roleKey]: permissionKeys }))
        if (isBackendAuthEnabled()) {
          await useBackendDataStore.getState().refreshProjectRbac(projectId)
        }
        return { ok: true as const }
      } finally {
        setRolePermissionSaving(false)
      }
    },
    [projectId, backendRolesDetailed]
  )

  const createBackendProjectRole = useCallback(
    async (name: string, note?: string) => {
      setAddRoleSaving(true)
      try {
        const res = await postProjectRole(projectId, { name, note: note?.trim() || null })
        if (!res.ok) return { ok: false as const, message: res.message }
        await useBackendDataStore.getState().refreshProjectRbac(projectId)
        return { ok: true as const }
      } finally {
        setAddRoleSaving(false)
      }
    },
    [projectId]
  )

  const setDefaultProjectRole = useCallback(
    async (roleKey: string) => {
      if (!isBackendAuthEnabled()) {
        setProjectRoles(prev => prev.map(item => ({ ...item, isDefault: item.key === roleKey })))
        return { ok: true as const }
      }
      const row = backendRolesDetailed?.find(r => r.key === roleKey)
      if (!row) return { ok: false as const, message: '未找到角色' }
      setRoleDefaultSavingKey(roleKey)
      setProjectRoles(prev => prev.map(item => ({ ...item, isDefault: item.key === roleKey })))
      try {
        const res = await patchProjectDefaultRole(projectId, row.id)
        if (!res.ok) return { ok: false as const, message: res.message }
        await useBackendDataStore.getState().refreshProjectRbac(projectId)
        return { ok: true as const }
      } finally {
        setRoleDefaultSavingKey(null)
      }
    },
    [projectId, backendRolesDetailed]
  )

  const deleteSelectedCustomRoles = useCallback(
    async (roleKeys: string[]) => {
      const deletable = roleKeys.filter(isCustomProjectRoleKey)
      if (deletable.length === 0) {
        return { ok: false as const, message: '仅可删除自定义添加的角色' }
      }
      if (!isBackendAuthEnabled()) {
        setProjectRoles(prev => prev.filter(r => !deletable.includes(r.key)))
        setSettingsSelectedRoleKeys([])
        return { ok: true as const }
      }
      setRoleDeleting(true)
      try {
        for (const roleKey of deletable) {
          const row = backendRolesDetailed?.find(r => r.key === roleKey)
          if (!row) return { ok: false as const, message: `未找到角色：${roleKey}` }
          const res = await deleteProjectRole(projectId, row.id)
          if (!res.ok) return { ok: false as const, message: res.message }
        }
        await useBackendDataStore.getState().refreshProjectRbac(projectId)
        setSettingsSelectedRoleKeys([])
        message.success('角色已删除，原成员已改为默认角色')
        return { ok: true as const }
      } finally {
        setRoleDeleting(false)
      }
    },
    [projectId, backendRolesDetailed]
  )

  return {
    projectRoles,
    setProjectRoles,
    defaultMemberRoleKey,
    settingsSelectedRoleKeys,
    setSettingsSelectedRoleKeys,
    rolePermissionSaving,
    roleDeleting,
    roleDefaultSavingKey,
    addRoleSaving,
    addRoleOpen,
    setAddRoleOpen,
    addRoleForm,
    rolePermissionOpen,
    setRolePermissionOpen,
    activeRoleForPermission,
    setActiveRoleForPermission,
    rolePermissionsByKey,
    setRolePermissionsByKey,
    persistProjectRolePermissions,
    createBackendProjectRole,
    setDefaultProjectRole,
    deleteSelectedCustomRoles,
    isCustomProjectRoleKey
  }
}
