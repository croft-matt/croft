import Link from 'next/link'

interface TopBarProps {
  workspaceName: string
  processing: number
  failed: number
}

export function TopBar({ workspaceName, processing, failed }: TopBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-background px-6 py-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {workspaceName}
      </p>

      <div className="flex-1 flex justify-center">
        {failed > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-amber-500">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Some emails failed to process.{' '}
            <Link href="/settings" className="underline underline-offset-2">
              Check settings
            </Link>
          </span>
        )}
        {failed === 0 && processing > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
            Processing {processing} {processing === 1 ? 'email' : 'emails'}
          </span>
        )}
      </div>

      <button
        type="button"
        disabled
        className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground cursor-not-allowed"
        title="Compose coming soon"
      >
        New email
      </button>
    </div>
  )
}
