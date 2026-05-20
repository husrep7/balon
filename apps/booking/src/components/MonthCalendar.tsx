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

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('bs-BA', {
    month: 'long', year: 'numeric',
  })

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 select-none">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-lg"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-800 capitalize">{monthLabel}</span>
        <button
          onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-lg"
        >
          ›
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
                'mx-auto w-9 h-9 flex items-center justify-center rounded-full text-sm transition-colors',
                isPast ? 'text-gray-300 cursor-not-allowed' : '',
                isSelected ? 'bg-teal-600 text-white font-semibold' : '',
                isToday && !isSelected ? 'border border-teal-400 text-teal-700 font-semibold' : '',
                !isPast && !isToday && !isSelected ? 'text-gray-700 hover:bg-teal-50 hover:text-teal-700' : '',
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
