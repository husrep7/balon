import { format, addDays, startOfWeek, parseISO } from 'date-fns'

export function fmtMoney(cents: number, currency = 'KM'): string {
  return `${(cents / 100).toFixed(0)} ${currency}`
}

export function fmtTime(iso: string): string {
  return format(parseISO(iso), 'HH:mm')
}

export function fmtDayShort(d: Date): { dow: string; dnum: string } {
  const dow = format(d, 'EEEEEE').toLowerCase() // "pon", "uto"
  return { dow, dnum: format(d, 'd') }
}

export function weekDays(from: Date, count = 5): Date[] {
  // Monday-based week
  const start = startOfWeek(from, { weekStartsOn: 1 })
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

export function isoRange(d: Date): { from: string; to: string } {
  const from = new Date(d)
  from.setHours(0, 0, 0, 0)
  const to = addDays(from, 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

/**
 * Convert ISO bookings to grid positions for a calendar that starts at `gridStartHour`
 * and uses 30-min rows (so 1 hour = 2 rows).
 */
export function rowsFromTime(iso: string, gridStartHour = 16): number {
  const d = parseISO(iso)
  const minutesSinceStart = (d.getHours() - gridStartHour) * 60 + d.getMinutes()
  return Math.max(0, Math.round(minutesSinceStart / 30))
}
