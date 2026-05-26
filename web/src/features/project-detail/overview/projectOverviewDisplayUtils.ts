import dayjs from 'dayjs'

/** 旧数据可能为富文本 HTML，展示与编辑时转为纯文本 */
export function stripHtmlToPlain(value: string) {
  if (!value?.trim()) return ''
  const v = value.trim()
  if (!/<[^>]+>/.test(v)) return v
  if (typeof document !== 'undefined') {
    const tmp = document.createElement('div')
    tmp.innerHTML = v
    return (tmp.textContent || tmp.innerText || '').trim()
  }
  return v
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const formatDateText = (value: string) => {
  if (!value?.trim()) return ''
  const t = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const parsed = dayjs(t, 'YYYY-MM-DD', true)
    if (parsed.isValid()) return parsed.year() === dayjs().year() ? parsed.format('M月D日') : parsed.format('YYYY年M月D日')
  }
  if (t.includes('月') && t.includes('日')) {
    if (t.includes('年')) return t
    return t
  }
  const parsed = dayjs(t)
  if (parsed.isValid()) return parsed.year() === dayjs().year() ? parsed.format('M月D日') : parsed.format('YYYY年M月D日')
  return value
}

export const parseDateValue = (value: string) => {
  if (!value?.trim()) return null
  const t = value.trim()
  const iso = dayjs(t, 'YYYY-MM-DD', true)
  if (iso.isValid()) return iso
  const zh = t.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (zh) {
    const d = dayjs(`${zh[1]}-${zh[2]}-${zh[3]}`, 'YYYY-M-D', true)
    if (d.isValid()) return d
  }
  const md = t.match(/^(\d{1,2})月(\d{1,2})日$/)
  if (md) {
    const year = dayjs().year()
    return dayjs(`${year}-${md[1]}-${md[2]}`, 'YYYY-M-D', true)
  }
  const loose = dayjs(t)
  return loose.isValid() ? loose : null
}

export const formatDateTime = (iso: string) => dayjs(iso).format('M月D日 HH:mm')

export const PROJECT_OVERVIEW_ACTIVITY_PAGE_SIZE = 10
