import dayjs from 'dayjs'

export const taskDateToSortNumber = (date: string): number => {
  if (!date?.trim()) return Number.POSITIVE_INFINITY
  const t = date.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = dayjs(t, 'YYYY-MM-DD', true)
    return d.isValid() ? d.year() * 10000 + (d.month() + 1) * 100 + d.date() : Number.POSITIVE_INFINITY
  }
  const ymdZh = t.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (ymdZh) {
    const d = dayjs(`${ymdZh[1]}-${ymdZh[2]}-${ymdZh[3]}`, 'YYYY-M-D', true)
    return d.isValid() ? d.year() * 10000 + (d.month() + 1) * 100 + d.date() : Number.POSITIVE_INFINITY
  }
  const matched = t.match(/^(\d{1,2})月(\d{1,2})日$/)
  if (!matched) return Number.POSITIVE_INFINITY
  const d = dayjs(`${dayjs().year()}-${matched[1]}-${matched[2]}`, 'YYYY-M-D', true)
  return d.isValid() ? d.year() * 10000 + (d.month() + 1) * 100 + d.date() : Number.POSITIVE_INFINITY
}

export const getTodaySortNumber = () => {
  const now = dayjs()
  return now.year() * 10000 + (now.month() + 1) * 100 + now.date()
}

export const parseMonthDayDate = (text?: string) => {
  if (!text?.trim()) return null
  const t = text.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = dayjs(t, 'YYYY-MM-DD', true)
    return d.isValid() ? d.startOf('day') : null
  }
  const y = t.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (y) {
    const d = dayjs(`${y[1]}-${y[2]}-${y[3]}`, 'YYYY-M-D', true)
    return d.isValid() ? d.startOf('day') : null
  }
  const matched = t.match(/^(\d{1,2})月(\d{1,2})日$/)
  if (!matched) return null
  const date = dayjs(`${dayjs().year()}-${matched[1]}-${matched[2]}`, 'YYYY-M-D', true)
  return date.isValid() ? date.startOf('day') : null
}
