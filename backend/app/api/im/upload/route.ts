import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/guards'
import { fail, ok } from '@/lib/http'

const MAX_BYTES = 25 * 1024 * 1024

/** 宽松 MIME 白名单（含常见 Office / 图片） */
const ALLOWED_MIME =
  /^(image\/(jpeg|jpg|png|gif|webp|bmp|svg\+xml|avif)|application\/pdf|text\/plain|application\/zip|application\/x-zip-compressed|application\/vnd\.openxmlformats)/i

const EXT_OK = /\.(png|jpe?g|gif|webp|bmp|svg|pdf|zip|txt|doc|docx|xls|xlsx|ppt|pptx)$/i

function mimeAllowed(mime: string, fileName: string): boolean {
  const m = mime.trim().toLowerCase()
  if (ALLOWED_MIME.test(m)) return true
  /** Windows / 部分浏览器会给空或 octet-stream，按扩展名放行 */
  if (m === '' || m === 'application/octet-stream') {
    return EXT_OK.test(fileName)
  }
  return false
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof Response) return auth

  const ct = req.headers.get('content-type') || ''
  if (!ct.includes('multipart/form-data')) return fail(400, '请使用 multipart/form-data')

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail(400, '无法解析表单')
  }
  const file = form.get('file')
  if (!(file instanceof File)) return fail(400, '缺少 file 字段')
  if (file.size <= 0) return fail(400, '文件为空')
  if (file.size > MAX_BYTES) return fail(400, `文件超过 ${MAX_BYTES / 1024 / 1024}MB 限制`)

  const orig = file.name || 'file'
  const mime = (file.type || '').trim().slice(0, 128) || 'application/octet-stream'
  if (!mimeAllowed(mime, orig)) {
    return fail(400, `不支持的文件类型（${mime || '未知'}）`)
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const extRaw = orig.includes('.') ? orig.split('.').pop() || '' : ''
  const safeExt = String(extRaw).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'bin'
  const name = `${randomUUID()}.${safeExt}`
  const dir = path.join(process.cwd(), 'public', 'im-uploads')
  await mkdir(dir, { recursive: true })
  const abs = path.join(dir, name)
  await writeFile(abs, buf)

  const publicUrl = `/im-uploads/${name}`
  return ok({
    url: publicUrl,
    name: orig.slice(0, 255),
    size: file.size,
    mimeType: mime,
  })
}
