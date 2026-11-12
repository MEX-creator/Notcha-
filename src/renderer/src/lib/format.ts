import type { CalendarEvent } from '../../../shared/types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

export function clockTime(date: Date, withSeconds = false): string {
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  if (!withSeconds) return `${hours}:${minutes}`
  return `${hours}:${minutes}:${date.getSeconds().toString().padStart(2, '0')}`
}

export function dateLine(date: Date): string {
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/** Title-bar date, in the reference's "Wednesday, 28 Oct" shape. */
export function titleDate(date: Date): string {
  return `${DAYS_LONG[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.round(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function remaining(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.round(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  if (mins >= 60) {
    const hours = Math.floor(mins / 60)
    return `${hours}h ${mins % 60}m`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function countdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function dayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return DAYS[date.getDay()] ?? 'Soon'
  return `${DAYS[date.getDay()]} ${date.getDate()}`
}

export function eventTime(event: CalendarEvent): string {
  if (event.allDay) return 'All day'
  const start = new Date(event.start)
  const end = new Date(event.end)
  const startText = clockTime(start)
  if (Number.isNaN(end.getTime())) return startText
  return `${startText} – ${clockTime(end)}`
}

export function relativeMinutes(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp)
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`
}

export function taskDueLabel(due: string | null): string | null {
  if (!due) return null
  const date = new Date(due)
  if (Number.isNaN(date.getTime())) return null
  return dayLabel(date.toISOString())
}
