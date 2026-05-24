'use client'

import type { StackEntry } from '@/lib/blocks/registry'
import type { BlockData } from '@/lib/blocks/types'
import type { OpenLoopsData } from '@/lib/blocks/open-loops'
import type { UnansweredQuestionsData } from '@/lib/blocks/unanswered-questions'
import { OpenLoopsBlock } from './open-loops-block'
import { UnansweredQuestionsBlock } from './unanswered-questions-block'

interface BlockStackProps {
  stack: StackEntry[]
}

function renderBlock(type: string, data: BlockData) {
  switch (type) {
    case 'open-loops':
      return <OpenLoopsBlock data={data as OpenLoopsData} />
    case 'unanswered-questions':
      return <UnansweredQuestionsBlock data={data as UnansweredQuestionsData} />
    // Commit D: logistics
    default:
      return null
  }
}

export function BlockStack({ stack }: BlockStackProps) {
  return (
    <div className="space-y-4">
      {stack.map(({ type, data }) => (
        <div key={type}>{renderBlock(type, data)}</div>
      ))}
    </div>
  )
}
