'use client'

import type { StackEntry } from '@/lib/blocks/registry'
import type { BlockData } from '@/lib/blocks/types'
import type { OpenLoopsData } from '@/lib/blocks/open-loops'
import type { UnansweredQuestionsData } from '@/lib/blocks/unanswered-questions'
import type { LogisticsData } from '@/lib/blocks/logistics'
import type { DocumentsData } from '@/lib/blocks/documents'
import type { DecisionsData } from '@/lib/blocks/decisions'
import type { SpecSheetData } from '@/lib/blocks/spec-sheet'
import type { MoneyData } from '@/lib/blocks/money'
import type { TimelineData } from '@/lib/blocks/timeline'
import type { ExpiriesData } from '@/lib/blocks/expiries'
import { OpenLoopsBlock } from './open-loops-block'
import { UnansweredQuestionsBlock } from './unanswered-questions-block'
import { LogisticsBlock } from './logistics-block'
import { DocumentsBlock } from './documents-block'
import { DecisionsBlock } from './decisions-block'
import { SpecSheetBlock } from './spec-sheet-block'
import { MoneyBlock } from './money-block'
import { TimelineBlock } from './timeline-block'
import { ExpiriesBlock } from './expiries-block'

interface BlockStackProps {
  stack: StackEntry[]
}

function renderBlock(type: string, data: BlockData) {
  switch (type) {
    case 'open-loops':
      return <OpenLoopsBlock data={data as OpenLoopsData} />
    case 'unanswered-questions':
      return <UnansweredQuestionsBlock data={data as UnansweredQuestionsData} />
    case 'logistics':
      return <LogisticsBlock data={data as LogisticsData} />
    case 'documents':
      return <DocumentsBlock data={data as DocumentsData} />
    case 'decisions':
      return <DecisionsBlock data={data as DecisionsData} />
    case 'spec-sheet':
      return <SpecSheetBlock data={data as SpecSheetData} />
    case 'money':
      return <MoneyBlock data={data as MoneyData} />
    case 'timeline':
      return <TimelineBlock data={data as TimelineData} />
    case 'expiries':
      return <ExpiriesBlock data={data as ExpiriesData} />
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
