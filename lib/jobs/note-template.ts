import type { Job } from '@/lib/types/database'

export function generateNote(job: Job, recipientName: string): string {
  const firstName = recipientName.split(' ')[0] ?? recipientName

  switch (job.intent) {
    case 'DELIVER':
      return `Hi ${firstName}, please find the attached. Let me know if you need anything else.`
    case 'CONFIRM':
      return `Hi ${firstName}, just confirming: ${job.description.toLowerCase()}. Please let me know if you have any questions.`
    case 'CHASE':
      return `Hi ${firstName}, following up on the below. Please let me know when you can get this across.`
    case 'REQUEST':
      return `Hi ${firstName}, ${job.description}. Please let me know if you need any further information.`
    default:
      return `Hi ${firstName},`
  }
}
