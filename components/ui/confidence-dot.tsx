import { cn } from '@/lib/utils'

interface ConfidenceDotProps {
  confidence: number
}

// Renders nothing at or above 0.85 -- high confidence is the default and needs no signal.
export function ConfidenceDot({ confidence }: ConfidenceDotProps) {
  if (confidence >= 0.85) return null

  const colorClass =
    confidence >= 0.6
      ? 'bg-amber-400'
      : 'bg-red-500'

  return (
    <span
      className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', colorClass)}
      title={`Confidence: ${Math.round(confidence * 100)}%`}
    />
  )
}
