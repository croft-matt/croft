const QUESTION_STARTERS = [
  'what', 'who', 'where', 'when', 'which', 'how', 'why',
  'show me', 'find', 'list', 'any', 'are there', 'is there',
  'do i', 'have i', 'can you', 'tell me',
]

export function looksLikeQuestion(query: string, matchingCommandCount: number): boolean {
  const q = query.trim().toLowerCase()

  // Too short to be a meaningful question.
  if (q.length < 5) return false

  // Explicit question mark.
  if (q.endsWith('?')) return true

  // Starts with a known question word.
  if (QUESTION_STARTERS.some(s => q.startsWith(s))) return true

  // Long enough and no commands match -- treat as natural language.
  if (matchingCommandCount === 0 && q.length > 15) return true

  return false
}
