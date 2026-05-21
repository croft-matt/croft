import { Calendar, Truck, Home, Settings, List } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FactCardProps {
  category: string
  data: Record<string, unknown>
}

function categoryIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('show') || lower.includes('event') || lower.includes('date')) {
    return <Calendar className="h-3.5 w-3.5" />
  }
  if (lower.includes('logistic') || lower.includes('truck') || lower.includes('vehicle') || lower.includes('travel')) {
    return <Truck className="h-3.5 w-3.5" />
  }
  if (lower.includes('hospital') || lower.includes('dressing') || lower.includes('hotel') || lower.includes('catering')) {
    return <Home className="h-3.5 w-3.5" />
  }
  if (lower.includes('technical') || lower.includes('production') || lower.includes('audio') || lower.includes('stage')) {
    return <Settings className="h-3.5 w-3.5" />
  }
  return <List className="h-3.5 w-3.5" />
}

function classifyValue(val: string): 'green' | 'red' | 'default' {
  const lower = val.toLowerCase()
  if (/\b(confirmed|available|filed|not needed|received|complete)\b/.test(lower)) return 'green'
  if (/\b(tbc|outstanding|overdue|missing|required|pending)\b/.test(lower)) return 'red'
  return 'default'
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') {
    // ISO date
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      const d = new Date(val)
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      }
    }
    return val
  }
  if (Array.isArray(val)) return `${val.length} item${val.length !== 1 ? 's' : ''}`
  // Stored fact shape: { value: string, confidence: number }
  if (typeof val === 'object' && val !== null && 'value' in val) {
    const v = (val as Record<string, unknown>).value
    if (typeof v === 'string') return formatValue(v)
  }
  return String(val)
}

export function FactCard({ category, data }: FactCardProps) {
  const title = category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && !Array.isArray(v))
  const arrayEntries = Object.entries(data).filter(([, v]) => Array.isArray(v))

  if (entries.length === 0 && arrayEntries.length === 0) return null

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-neutral-500">
        {categoryIcon(category)}
        <p className="text-[10px] font-semibold uppercase tracking-wider">{title}</p>
      </div>

      <div className="divide-y divide-neutral-800">
        {entries.map(([key, val]) => {
          const formatted = formatValue(val)
          const sentiment = classifyValue(formatted)
          const keyLabel = key.replace(/_/g, ' ')

          return (
            <div key={key} className="flex items-center justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
              <span className="text-xs text-neutral-500 capitalize">{keyLabel}</span>
          <span
            className={cn(
              'text-xs font-medium text-right',
              sentiment === 'green' && 'text-white',
              sentiment === 'red' && 'text-red-400',
              sentiment === 'default' && 'text-neutral-200'
            )}
              >
                {formatted}
              </span>
            </div>
          )
        })}
      </div>

      {arrayEntries.map(([key, arr]) => {
        if (!Array.isArray(arr) || arr.length === 0) return null
        return (
          <div key={key} className="mt-3">
            <p className="mb-1.5 text-[10px] text-neutral-600 uppercase tracking-wider capitalize">
              {key.replace(/_/g, ' ')}
            </p>
            <div className="space-y-1.5">
              {(arr as Record<string, unknown>[]).map((item, i) => (
                <div key={i} className="rounded-md bg-neutral-800 px-3 py-2 text-xs text-neutral-300">
                  {Object.entries(item)
                    .map(([k, v]) => `${v}`)
                    .join(' · ')}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
