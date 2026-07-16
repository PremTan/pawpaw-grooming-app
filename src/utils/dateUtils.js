import { formatDistanceToNow } from 'date-fns'

export function getRelativeTime(value) {
  if (!value) return ''

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const elapsed = Date.now() - date.getTime()
  if (elapsed < 60_000) {
    return 'Just now'
  }

  return formatDistanceToNow(date, { addSuffix: true })
}
