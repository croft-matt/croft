import type { BlockDefinition, BlockData, RoomReadModel } from './types'
import type { OpenLoop } from '@/lib/jobs/open-loops'

export interface Question {
  id: string
  description: string
  from_name: string | null
  owner: string | null
  email_id: string
  // Approximated from job.created_at — close enough for display purposes.
  asked_at: string
  age_days: number
  // The full loop is retained so the job modal can be opened with a complete Job.
  loop: OpenLoop
}

export interface UnansweredQuestionsData extends BlockData {
  awaitingYou: Question[]
  awaitingOthers: Question[]
}

function loopToQuestion(loop: OpenLoop): Question {
  return {
    id: loop.id,
    description: loop.description,
    from_name: loop.from_name,
    owner: loop.owner,
    email_id: loop.email_id,
    asked_at: loop.created_at,
    age_days: loop.age_days,
    loop,
  }
}

export const unansweredQuestionsBlock: BlockDefinition<UnansweredQuestionsData> = {
  type: 'unanswered-questions',
  title: 'Unanswered questions',
  defaultActive: false,
  hasEvidence(model: RoomReadModel): boolean {
    const hasInYours = model.openLoops.yourCourt.some((l) => l.intent === 'QUERY')
    const hasInTheirs = model.openLoops.theirCourt.some((l) => l.intent === 'QUERY')
    return hasInYours || hasInTheirs
  },
  resolve(model: RoomReadModel): UnansweredQuestionsData {
    // QUERY jobs are already in openLoops — no second query needed.
    const awaitingYou = model.openLoops.yourCourt
      .filter((l) => l.intent === 'QUERY')
      .map(loopToQuestion)

    const awaitingOthers = model.openLoops.theirCourt
      .filter((l) => l.intent === 'QUERY')
      .map(loopToQuestion)

    return {
      awaitingYou,
      awaitingOthers,
      isEmpty: awaitingYou.length === 0 && awaitingOthers.length === 0,
    }
  },
  preview(data: UnansweredQuestionsData): string {
    const total = data.awaitingYou.length + data.awaitingOthers.length
    return `${total} open ${total === 1 ? 'question' : 'questions'}`
  },
}
