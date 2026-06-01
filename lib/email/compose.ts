export interface PersonReplyItem {
  description: string
  answer: string // must be non-empty -- filter before calling
}

// Builds the plain-text body for a person reply from answered items only.
// Single item: greeting + answer + sign-off, no "Re:" label.
// Multiple items: each answer preceded by "Re: [description]".
export function buildPersonReplyBody(
  items: PersonReplyItem[],
  recipientFirstName: string,
  senderFirstName: string,
): string {
  if (items.length === 0) return ''

  const greeting = `Hi ${recipientFirstName},`
  const signOff = `Best,\n${senderFirstName}`

  if (items.length === 1) {
    return [greeting, items[0].answer.trim(), signOff].join('\n\n')
  }

  const blocks = items.map((item) => `Re: ${item.description}\n${item.answer.trim()}`)
  return [greeting, ...blocks, signOff].join('\n\n')
}

// Derives a first name from a display name or email address.
// Used for reply greetings and sign-offs.
export function firstNameFrom(nameOrAddress: string): string {
  if (!nameOrAddress) return ''
  if (nameOrAddress.includes('@')) {
    return nameOrAddress.split('@')[0]
  }
  return nameOrAddress.split(/\s+/)[0]
}
