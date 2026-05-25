'use client'

interface NoteFieldProps {
  value: string
  onChange: (value: string) => void
}

export function NoteField({ value, onChange }: NoteFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Message</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring resize-none transition-colors"
        placeholder="Write your message..."
      />
    </div>
  )
}
