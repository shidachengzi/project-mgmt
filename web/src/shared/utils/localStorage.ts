export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

export function safeRemoveItem(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

