'use client'

interface NoteFieldProps {
  value: string
  onChange: (value: string) => void
}

export function NoteField({ value, onChange }: NoteFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1.5">Message</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-neutral-600 resize-none transition-colors"
        placeholder="Write your message..."
      />
    </div>
  )
}
