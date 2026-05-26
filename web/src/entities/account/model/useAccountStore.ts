import { create } from 'zustand'
import type { AccountLoginLog, AccountProfile } from './types'

const EMPTY_PROFILE: AccountProfile = {
  name: '',
  code: '',
  email: '',
  phone: ''
}

type AccountState = {
  profile: AccountProfile
  logs: AccountLoginLog[]
  setProfile: (next: AccountProfile) => void
  patchProfile: (patch: Partial<AccountProfile>) => void
  setLogs: (next: AccountLoginLog[]) => void
  reset: () => void
}

/** 仅内存态：登录 /auth/me 与账号设置页拉取后端后写入，不落 localStorage（避免明文密码等敏感/过期数据残留）。 */
export const useAccountStore = create<AccountState>()(set => ({
  profile: { ...EMPTY_PROFILE },
  logs: [],
  setProfile: next => set({ profile: next }),
  patchProfile: patch => set(s => ({ profile: { ...s.profile, ...patch } })),
  setLogs: next => set({ logs: next }),
  reset: () => set({ profile: { ...EMPTY_PROFILE }, logs: [] })
}))
