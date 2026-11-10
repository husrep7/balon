import { useMemo, useState } from 'react'
import {
  useCreatePricingRule,
  useDeletePricingRule,
  usePricingRules,
  useResources,
  useUpdatePricingRule,
} from '@/hooks'
import { Badge, Button, Input, Modal } from '@/components/ui'
import { fmtMoney } from '@/lib/time'
import { ApiError } from '@/lib/api'
import type { PricingRule, ResourceKind } from '@/lib/types'

const KIND_LABEL: Record<ResourceKind, string> = {
  full_pitch: 'Cijeli teren',
  half_pitch: 'Pola terena',
  court: 'Court',
  other: 'Ostalo',
}

export function Pricing() {
  const { data: rules = [], isLoading } = usePricingRules(true)
  const { data: resources = [] } = useResources()
  const [createOpen, setCreateOpen] = useState(false)

  const kinds = useMemo<ResourceKind[]>(() => {
    const set = new Set<ResourceKind>()
    for (const r of resources) set.add(r.kind)
    if (set.size === 0) set.add('full_pitch')
    return Array.from(set)
  }, [resources])

  return (
    <div className="flex-1 w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Cjenovnik</h1>
          <p className="text-xs text-ink-500 mt-0.5">
            Pravila cijene po trajanju termina, tipu resursa i drugim uslovima
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + Nova cijena
        </Button>
      </div>

      <div className="text-xs text-ink-500 bg-info-bg border border-info-fg/20 rounded p-3 mb-4">
        Pravilo sa <strong>nižim prioritetom</strong> i <strong>većim min. trajanjem</strong> dobija
        prednost. Bookingu trajanja N min se računa najveće pravilo gdje je min. trajanje ≤ N.
      </div>

      {isLoading ? (
        <div className="text-sm text-ink-400">učitavam...</div>
      ) : (
        <RulesTable rules={rules} />
      )}

      <CreateRuleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        availableKinds={kinds}
      />
    </div>
  )
}

function RulesTable({ rules }: { rules: PricingRule[] }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead className="bg-surface-muted text-xs uppercase tracking-wider text-ink-500">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Naziv</th>
            <th className="text-left px-4 py-2.5 font-medium">Trajanje</th>
            <th className="text-left px-4 py-2.5 font-medium">Resurs</th>
            <th className="text-left px-4 py-2.5 font-medium">Ostali uslovi</th>
            <th className="text-right px-4 py-2.5 font-medium">Cijena</th>
            <th className="text-right px-4 py-2.5 font-medium">Prio</th>
            <th className="text-right px-4 py-2.5 font-medium w-32">Akcije</th>
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-ink-400 text-sm">
                Nema definisanih pravila. Dodaj prvo.
              </td>
            </tr>
          )}
          {rules.map((r) => (
            <RuleRow key={r.id} rule={r} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RuleRow({ rule }: { rule: PricingRule }) {
  const update = useUpdatePricingRule()
  const del = useDeletePricingRule()
  const [editing, setEditing] = useState(false)
  const [priceKM, setPriceKM] = useState<number>(Math.round(rule.price_cents / 100))

  function save() {
    const cents = Math.round(priceKM * 100)
    if (cents === rule.price_cents) {
      setEditing(false)
      return
    }
    update.mutate(
      { id: rule.id, patch: { price_cents: cents } },
      { onSettled: () => setEditing(false) },
    )
  }

  function toggleActive() {
    update.mutate({ id: rule.id, patch: { active: !rule.active } })
  }

  const dur = rule.conditions.min_duration_minutes
  const kindList = rule.conditions.resource_kind
  const dowList = rule.conditions.day_of_week
  const timeRange = rule.conditions.time_range
  const otherBits: string[] = []
  if (dowList && dowList.length > 0) otherBits.push(`DOW ${dowList.join(',')}`)
  if (timeRange) otherBits.push(`${timeRange[0]}–${timeRange[1]}`)
  if (rule.conditions.customer_tier && rule.conditions.customer_tier.length > 0)
    otherBits.push(rule.conditions.customer_tier.join('/'))

  return (
    <tr className={`border-t border-ink-100 ${!rule.active ? 'opacity-50' : ''}`}>
      <td className="px-4 py-2.5 text-sm font-medium text-ink-800">
        {rule.name}
        {!rule.active && <Badge tone="neutral" className="ml-2">isključeno</Badge>}
      </td>
      <td className="px-4 py-2.5 text-sm text-ink-600 tabular">
        {dur ? `≥ ${dur} min` : <span className="text-ink-400">—</span>}
      </td>
      <td className="px-4 py-2.5 text-sm text-ink-600">
        {kindList && kindList.length > 0
          ? kindList.map((k) => KIND_LABEL[k] ?? k).join(', ')
          : <span className="text-ink-400">svi</span>}
      </td>
      <td className="px-4 py-2.5 text-xs text-ink-500">
        {otherBits.length > 0 ? otherBits.join(' · ') : <span className="text-ink-400">—</span>}
      </td>
      <td className="px-4 py-2.5 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-1">
            <Input
              type="number"
              min={0}
              step={5}
              value={priceKM}
              onChange={(e) => setPriceKM(parseInt(e.target.value) || 0)}
              className="w-20 text-right tabular"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') {
                  setPriceKM(Math.round(rule.price_cents / 100))
                  setEditing(false)
                }
              }}
            />
            <span className="text-xs text-ink-500">KM</span>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-ink-800 tabular hover:text-teal-700"
            title="Klikni za izmjenu"
          >
            {fmtMoney(rule.price_cents)}
          </button>
        )}
      </td>
      <td className="px-4 py-2.5 text-right text-xs text-ink-500 tabular">{rule.priority}</td>
      <td className="px-4 py-2.5 text-right">
        <div className="inline-flex gap-1">
          {editing ? (
            <>
              <Button size="sm" variant="primary" onClick={save} disabled={update.isPending}>
                Spasi
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPriceKM(Math.round(rule.price_cents / 100))
                  setEditing(false)
                }}
              >
                X
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={toggleActive} disabled={update.isPending}>
                {rule.active ? 'Isključi' : 'Uključi'}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (confirm(`Obrisati pravilo "${rule.name}"?`)) del.mutate(rule.id)
                }}
                disabled={del.isPending}
              >
                Briši
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

function CreateRuleModal({
  open,
  onClose,
  availableKinds,
}: {
  open: boolean
  onClose: () => void
  availableKinds: ResourceKind[]
}) {
  const create = useCreatePricingRule()
  const [name, setName] = useState('')
  const [duration, setDuration] = useState<number | ''>('')
  const [priceKM, setPriceKM] = useState<number>(0)
  const [kind, setKind] = useState<ResourceKind | ''>(availableKinds[0] ?? '')
  const [priority, setPriority] = useState<number>(100)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setDuration('')
    setPriceKM(0)
    setKind(availableKinds[0] ?? '')
    setPriority(100)
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function submit() {
    setError(null)
    if (!name.trim()) {
      setError('Naziv je obavezan')
      return
    }
    if (priceKM <= 0) {
      setError('Cijena mora biti veća od nule')
      return
    }
    const conditions: import('@/lib/types').PricingConditions = {}
    if (typeof duration === 'number' && duration > 0) {
      conditions.min_duration_minutes = duration
    }
    if (kind) {
      conditions.resource_kind = [kind]
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        priority,
        price_cents: Math.round(priceKM * 100),
        conditions,
        active: true,
      })
      handleClose()
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.body === 'object' && err.body && 'error' in err.body
          ? String((err.body as { error: unknown }).error)
          : err instanceof Error
            ? err.message
            : 'Greška'
      setError(msg)
    }
  }

  // Auto-derive priority from duration: longer = lower priority number (matches first).
  function setDurationAndPriority(d: number | '') {
    setDuration(d)
    if (typeof d === 'number' && d > 0) {
      setPriority(Math.max(1, 200 - d))
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo pravilo cijene"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={create.isPending}>
            Odustani
          </Button>
          <Button variant="primary" onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Snimam...' : 'Sačuvaj'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-ink-600 mb-1">Naziv pravila</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="npr. 75 min — cijeli teren"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-600 mb-1">Trajanje od (min)</label>
            <div className="flex gap-1">
              {[60, 75, 90, 120].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationAndPriority(d)}
                  className={`px-2.5 py-1.5 text-xs rounded border ${
                    duration === d
                      ? 'border-teal-500 bg-teal-50 text-teal-800'
                      : 'border-ink-200 text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  {d}
                </button>
              ))}
              <Input
                type="number"
                min={0}
                step={5}
                value={duration}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : parseInt(e.target.value) || 0
                  setDurationAndPriority(v)
                }}
                className="w-20 ml-1"
                placeholder="—"
              />
            </div>
            <p className="text-[11px] text-ink-400 mt-1">prazno = bez trajanja (fallback)</p>
          </div>

          <div>
            <label className="block text-xs text-ink-600 mb-1">Cijena (KM)</label>
            <Input
              type="number"
              min={0}
              step={5}
              value={priceKM}
              onChange={(e) => setPriceKM(parseInt(e.target.value) || 0)}
              className="text-lg tabular"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-ink-600 mb-1">Tip resursa</label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setKind('')}
              className={`px-2.5 py-1.5 text-xs rounded border ${
                kind === ''
                  ? 'border-teal-500 bg-teal-50 text-teal-800'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50'
              }`}
            >
              svi
            </button>
            {availableKinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`px-2.5 py-1.5 text-xs rounded border ${
                  kind === k
                    ? 'border-teal-500 bg-teal-50 text-teal-800'
                    : 'border-ink-200 text-ink-600 hover:bg-ink-50'
                }`}
              >
                {KIND_LABEL[k] ?? k}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-ink-600 mb-1">
            Prioritet <span className="text-ink-400">(niži broj = veća prednost)</span>
          </label>
          <Input
            type="number"
            min={1}
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 100)}
            className="w-24 tabular"
          />
        </div>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
