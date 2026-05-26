import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

type UseLocalStorageStateResult<T> = {
  state: T
  setState: Dispatch<SetStateAction<T>>
  hydrated: boolean
}

type UseLocalStorageStateOptions<T> = {
  merge?: (prev: T, hydrated: T) => T
  /** 为 true 时不读写 localStorage，仅作内存 state（如后端工作区同步） */
  skipStorage?: boolean
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function useLocalStorageState<T>(
  storageKey: string,
  defaultValue: T,
  options?: UseLocalStorageStateOptions<T>
): UseLocalStorageStateResult<T> {
  const [state, setState] = useState<T>(defaultValue)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(false)
    if (options?.skipStorage) {
      setState(prev => (options?.merge ? options.merge(prev, defaultValue) : defaultValue))
      setHydrated(true)
      return
    }
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) {
        setState(prev => (options?.merge ? options.merge(prev, defaultValue) : defaultValue))
        return
      }
      const parsed = safeParseJson<T>(raw)
      const next = parsed ?? defaultValue
      setState(prev => (options?.merge ? options.merge(prev, next) : next))
    } finally {
      setHydrated(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  useEffect(() => {
    if (!hydrated || options?.skipStorage) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [hydrated, state, storageKey])

  return { state, setState, hydrated }
}

