interface PlaceholderProps {
  title: string
  description: string
}

function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <div className="flex-1 w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-ink-900">{title}</h1>
      <p className="text-xs text-ink-500 mt-0.5">{description}</p>

      <div className="mt-6 p-10 border border-dashed border-ink-200 rounded-lg text-center">
        <p className="text-ink-400 text-sm">
          Ovaj ekran je u izgradnji. API endpointi postoje na backendu — UI dolazi u Phase 2.
        </p>
      </div>
    </div>
  )
}

export function Teams() {
  return <Placeholder title="Ekipe" description="Stalne ekipe sa kapitenom i članovima" />
}

export function Shifts() {
  return <Placeholder title="Smjene" description="Otvori, zatvori smjenu, evidencija naplata i varijansa" />
}
