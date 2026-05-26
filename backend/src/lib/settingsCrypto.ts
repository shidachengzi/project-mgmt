declare const __non_webpack_require__: NodeJS.Require | undefined

/** Node 内置 crypto；避免 `import 'crypto'` / `import from 'module'` 被 instrumentation 的 Webpack 子图错误改写 */
function getRequire(): NodeJS.Require {
  if (typeof __non_webpack_require__ === 'function') return __non_webpack_require__
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require
}

function nodeCrypto(): typeof import('crypto') {
  return getRequire()('crypto') as typeof import('crypto')
}

const ALGO = 'aes-256-gcm'

function key32(): Buffer {
  const crypto = nodeCrypto()
  const raw =
    process.env.SETTINGS_ENCRYPTION_SECRET?.trim() ||
    process.env.JWT_REFRESH_SECRET?.trim() ||
    'dev_settings_encryption_change_me'
  return crypto.createHash('sha256').update(raw).digest()
}

/** 加密 SMTP 口令等敏感配置（Base64URL：iv + tag + ciphertext） */
export function encryptSettingSecret(plain: string): string {
  const crypto = nodeCrypto()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key32(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64url')
}

export function decryptSettingSecret(blob: string): string | null {
  try {
    const crypto = nodeCrypto()
    const buf = Buffer.from(blob, 'base64url')
    if (buf.length < 28) return null
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = crypto.createDecipheriv(ALGO, key32(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
