import { useState } from 'react'

const WEEKDAYS = ['Po', 'Ut', 'Sr', 'Če', 'Pe', 'Su', 'Ne']

interface Props {
  selected: Date
  today: Date
  onSelect: (d: Date) => void
}

export function MonthCalendar({ selected, today, onSelect }: Props) {
  const [viewYear, setViewYear] = useState(selected.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected.getMonth())

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const firstDay = new Date(viewYear, viewMonth, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1
    if (dayNum < 1 || dayNum > daysInMonth) return null
    return new Date(viewYear, viewMonth, dayNum)
  })

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('sr-Latn-BA', {
    month: 'long', year: 'numeric',
  })

  return (
    <div className="card p-5 select-none">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="w-10 h-10 flex items-center justify-center rounded-xl ring-1 ring-gray-200 hover:bg-gray-50 text-gray-700 active:scale-95 transition-transform"
          aria-label="Prethodni mjesec"
        >
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 4.5 7 10l5.5 5.5" /></svg>
        </button>
        <span className="text-base font-display font-extrabold text-gray-900 first-letter:uppercase">{monthLabel}</span>
        <button
          onClick={nextMonth}
          className="w-10 h-10 flex items-center justify-center rounded-xl ring-1 ring-gray-200 hover:bg-gray-50 text-gray-700 active:scale-95 transition-transform"
          aria-label="Sljedeći mjesec"
        >
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 4.5 13 10l-5.5 5.5" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const todayStart = new Date(today); todayStart.setHours(0,0,0,0)
          const dStart = new Date(d); dStart.setHours(0,0,0,0)
          const isPast = dStart < todayStart
          const isToday = d.toDateString() === today.toDateString()
          const isSelected = d.toDateString() === selected.toDateString()

          return (
            <button
              key={i}
              disabled={isPast}
              onClick={() => onSelect(d)}
              className={[
                'mx-auto w-10 h-10 flex items-center justify-center rounded-xl text-sm font-medium transition-all active:scale-90',
                isPast ? 'text-gray-300 cursor-not-allowed' : '',
                isSelected ? 'bg-gray-900 text-white font-bold shadow-lift' : '',
                isToday && !isSelected ? 'bg-teal-50 ring-1 ring-teal-300 text-teal-700 font-bold' : '',
                !isPast && !isToday && !isSelected ? 'text-gray-800 hover:bg-teal-50 hover:text-teal-700' : '',
              ].join(' ')}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
