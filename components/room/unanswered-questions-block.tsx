'use client'

import Link from 'next/link'
import { useJobModal } from '@/stores/job-modal-store'
import type { UnansweredQuestionsData, Question } from '@/lib/blocks/unanswered-questions'

function formatAge(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

interface UnansweredQuestionsBlockProps {
  data: UnansweredQuestionsData
}

export function UnansweredQuestionsBlock({ data }: UnansweredQuestionsBlockProps) {
  const { open } = useJobModal()

  if (data.isEmpty) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
          Unanswered questions
        </p>
        <p className="text-sm text-neutral-600">No open questions here.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-3">
        Unanswered questions
      </p>

      {data.awaitingYou.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-600 mb-2">
            Awaiting you
          </p>
          <div className="divide-y divide-neutral-800">
            {data.awaitingYou.map((q) => (
              <AwaitingYouRow key={q.id} question={q} onOpen={() => open(q.loop)} />
            ))}
          </div>
        </div>
      )}

      {data.awaitingOthers.length > 0 && (
        <div className={data.awaitingYou.length > 0 ? 'border-t border-neutral-800 pt-4' : ''}>
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-600 mb-2">
            Awaiting others
          </p>
          <div className="divide-y divide-neutral-800">
            {data.awaitingOthers.map((q) => (
              <AwaitingOthersRow key={q.id} question={q} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AwaitingYouRow({ question, onOpen }: { question: Question; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-start gap-3 py-3 first:pt-0 text-left hover:opacity-80 transition-opacity"
    >
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-100 leading-snug">{question.description}</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          {[question.from_name ?? question.owner, formatAge(question.age_days)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </button>
  )
}

function AwaitingOthersRow({ question }: { question: Question }) {
  return (
    <Link
      href={`/emails/${question.email_id}`}
      className="flex items-start gap-3 py-3 first:pt-0 hover:opacity-80 transition-opacity"
    >
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neutral-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-100 leading-snug">{question.description}</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          {[question.owner, formatAge(question.age_days)].filter(Boolean).join(' · ')}
        </p>
      </div>
    </Link>
  )
}
