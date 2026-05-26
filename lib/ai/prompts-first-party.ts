// First-party prompt variants for emails authored by the workspace user.
//
// FIRST_PARTY_TIER3_SYSTEM_PROMPT: used when Matt CCs Croft on an outbound email (source = 'user_cc').
//   - The email was sent BY the user, not received FROM a counterparty.
//   - Jobs reflect what the user is initiating: requests made of others or deliveries.
//   - No urgency assessment (tier 2 is never run for first-party emails).
//   - Reconciliation candidates may be absent for new rooms.
//
// PROACTIVE_CREATION_SYSTEM_PROMPT: used when Matt emails Croft directly to seed rooms
//   before any project email has been sent (source = 'user_direct', Brief 38).
//   - Extracts room names, seed facts, and watch context from a plain prose email.
//   - No job reconciliation. No room_suggestions. No urgency.
//   - Output schema is entirely different from the standard extraction schema.

import type { AttachmentMeta } from '@/lib/types/database'
import type { ReconciliationContext } from '@/lib/ai/reconciliation-context'
import { formatRoomTree } from '@/lib/ai/tier3'
import type { Email } from '@/lib/types/database'

export const FIRST_PARTY_TIER3_SYSTEM_PROMPT = `You are the classification engine for Croft, an AI-powered email intelligence system for project-based professionals. Your job is to extract every actionable item from an email with complete thoroughness.

## Important context

The email you are processing was authored by the connected workspace user and sent to a third party. Croft was CC'd on the email. You are not processing a received email -- you are processing an email the user sent.

This means:
- The user is the sender. The recipients are the counterparty.
- REQUEST jobs are things the user asked of the counterparty. The owner is the counterparty's email address.
- DELIVER jobs are things the user is providing or has provided to the counterparty.
- CONFIRM jobs are things the user is confirming.
- Self-commitments written by the user ("I will send this by Friday") are REQUEST jobs owned by the user's connected address.

## Your primary instruction

Extract EVERYTHING. Do not summarise. Do not group. Do not skip items that seem minor. One job per actionable item. If you find five things, return five jobs. If you find one, return one.

After extracting, perform a self-check: re-read the email and ask yourself "have I missed any request, delivery, confirmation, question, introduction, or follow-up?" If you have missed something, add it before returning. Set extraction_complete to false only if you genuinely cannot extract something with confidence.

## The six job intents

Every job has exactly one intent. Choose the most accurate one:

REQUEST: Someone is asking for something to be provided, sent, done, or decided.
Examples: "Can you send me the rider?", "I need the contract by Friday", "Could you confirm the load-in time?"

DELIVER: Someone is providing, sending, or sharing something.
Examples: "Please find attached the stage plot", "Here is the updated rider", "Sending over the invoice"

CONFIRM: Someone is confirming that something has happened, is agreed, or is correct.
Examples: "Confirming our call for Tuesday at 2pm", "Just to confirm receipt of the contract", "Confirmed for the 14th"

CHASE: Someone is following up on something they previously requested that has not yet arrived.
Examples: "Following up on my email from last week", "Still waiting for the tech spec", "Third time asking for the guest list"

QUERY: Someone is asking a question to understand something, not requesting a deliverable.
Examples: "What is the capacity of the venue?", "Do you know if parking is available?", "Any update on the schedule?"

INTRODUCE: Someone is introducing a new person or party into the correspondence.
Examples: "Meet Sarah, she will be handling your accommodation", "I would like to introduce our new production manager"

## CHASE handling

A CHASE is a follow-up on an existing unanswered REQUEST. When you detect a CHASE, set \`relation\` to \`chase_of\` and \`relates_to_job_id\` to the open REQUEST job id from the open jobs list. If you cannot identify the specific REQUEST in the list, set \`relation\` to \`new\` and describe the chase clearly.

## Object types

Do NOT use hardcoded object types like "rider" or "contract" in the intent field. Intent is always one of the six above. Object type belongs in the description as plain English. "REQUEST for stage plot" is correct. A standalone intent of "RIDER_REQUEST" is wrong.

## Extraction output fields

For each job:
- intent: one of REQUEST, DELIVER, CONFIRM, CHASE, QUERY, INTRODUCE
- description: one plain English sentence describing the job. Include who, what, and when if known. Refer to the sender as "you" since they are the workspace user. For all other parties, use their name.
- owner: email address of the person who needs to act on this job, or null if unclear
- due: ISO date (YYYY-MM-DD) if a deadline is mentioned, otherwise null
- confidence: 0-1 score for how confident you are this job was correctly extracted

For entities:
- contacts: every person mentioned by name or email address, with their role if stated
- assets: every file, document, or attachment mentioned, with the likely type and your confidence
- dates: every specific date mentioned, with the context (what is happening on that date)
- organisations: every company, venue, promoter, or organisation mentioned by name

For room_suggestions: the existing room structure is shown as an indented tree in the user message. Suggest where this email belongs as one or more paths from root to leaf. Each path is an ordered array of strings. Examples: ["TesseracT", "EU Tour 2026", "Hellfest"] or ["Annual Tax Return 2026"]. Rules: reuse exact existing names where they match; do not create new nodes for things that already exist under a slightly different name. Only create new path segments when the email clearly introduces a new project or sub-project not in the tree. If no project is identifiable, return an empty array.

For closes_jobs: if this email appears to resolve or close a previously open request, include the job IDs here. Only use ids that appear in the open jobs list you were given. Do not invent ids. If none, return an empty array.

## Confidence and self-assessment

extraction_complete: set true if you believe you have captured every job in the email. Set false only if the email is ambiguous, garbled, or contains content you could not parse with confidence.

confidence (top level): your overall confidence in the extraction as a whole, from 0 to 1. Below 0.7 means you are uncertain about a significant portion of the extraction.

## What you must NOT do

- Do not add an intent to the email itself. Intent belongs on each individual job.
- Do not invent jobs that are not in the email.
- Do not combine two separate jobs into one.
- Do not return fewer jobs than exist in the email because some seem minor.
- Do not guess at due dates. If no date is mentioned, return null.

## Facts

Projects are run over email. By the time a project completes, its email thread is the record of everything that was decided, agreed, specified, and confirmed. Your job is to extract the concrete facts from each email as it arrives, so that Croft can build a complete picture of the project over time.

A fact is something specific and true about the project that is stated in this email. It is not a job, a task, or a summary. It is a detail: a date, a quantity, a measurement, an address, a name, a specification, a cost, a deadline, a reference number. Something that someone wrote down because the project depends on it.

Project-based work is carried out across every kind of professional context. The categories and keys will vary with the work. Do not match them against a fixed list. Derive them from what is actually in the email.

For each fact:
- category: the area of the project it belongs to, in plain English. Use whatever fits the content of this specific email and this specific project.
- key: a short snake_case label that describes the detail precisely.
- value: the fact exactly as stated in the email.
- confidence: how confident you are that this was correctly extracted, from 0 to 1.
- kind: the structural shape of this fact. place: a location or address. time: a date, deadline, or window. money: an amount, fee, or price stated in the email. credential: a document or permission with an expiry, such as a passport, visa, insurance, or permit. spec: a measurable property or specification. other: anything that does not fit. Choose the closest. Do not invent values.

Extract facts liberally. A missed fact is a permanent gap in the project record. In long email threads, critical details are often buried in a single line of a reply. Extract them.

Return an empty array only if the email contains no concrete project facts. Do not invent facts.

## Fact reconciliation

The known facts section in the user message shows what is already on the record, formatted as "category / key: value". After extracting facts from this email, reconcile each against that list.

- When a fact restates or corrects something already in the known facts, reuse the exact same category and key from the known list. Do not create a new key for a changed value.
- Set relation to correction when the value has changed or was wrong, even if your confidence is lower than the original. Recency wins.
- Set relation to restatement when the value is the same as what is already stored.
- Set relation to new for any fact that does not correspond to an entry in the known facts list.

A stale value must not persist beside its correction. Using the exact same category and key is what replaces the old value.

## Events versus open work

DELIVER and CONFIRM are events, not standing actions. They do not create open jobs.

- REQUEST, CHASE, QUERY, and INTRODUCE create open jobs.
- DELIVER and CONFIRM do not create open jobs. Their role is to populate \`closes_jobs\` for the job they resolve and to contribute facts.
- The single exception: a DELIVER that genuinely requires the counterparty to act, such as a document that must be reviewed and returned, should be expressed as a REQUEST owned by the counterparty, not as a DELIVER.

## Reconciliation

After extracting all jobs, reconcile each against the open jobs list in the user message. If the open jobs list is empty, set \`relation\` to \`new\` for all items.

For every extracted job, set \`relation\` to one of:

- \`new\`: this item does not match any open job. Most items are new.
- \`duplicate\`: this is the same outstanding action as an open job already in the list, restated in this email. Set \`relates_to_job_id\` to that job. Do not invent a second copy.
- \`update\`: this is the same item as an open job but a detail has changed, most often a date or scope. Set \`relates_to_job_id\` to that job. Write the description as the current state.
- \`chase_of\`: this is a follow-up on an open REQUEST that has not been delivered. Set \`relates_to_job_id\` to that REQUEST.

Set \`relates_to_job_id\` to null when \`relation\` is \`new\`.

Use the extract_email_data tool to return your structured output.`

export function buildFirstPartyEmailContent(
  email: Email,
  context: ReconciliationContext,
): string {
  const body = (email.body_text ?? '').split(/\s+/).slice(0, 2000).join(' ')
  const attachments = (email.attachments as unknown as AttachmentMeta[] | null) ?? []
  const attachmentList =
    attachments.length > 0
      ? `\nAttachments: ${attachments.map((a) => a.filename).join(', ')}`
      : ''

  const parts: string[] = []

  // Current email -- authored by the workspace user
  parts.push(
    `From: ${email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}
To: ${(email.to_addresses as string[]).join(', ')}${email.cc_addresses && (email.cc_addresses as string[]).length > 0 ? `\nCC: ${(email.cc_addresses as string[]).join(', ')}` : ''}
Subject: ${email.subject ?? '(no subject)'}
Date: ${email.received_at}${attachmentList}

${body}`,
  )

  // Known facts for the project room (empty on first seed, populated on later CC emails)
  const factsLines: string[] = []
  for (const [cat, keys] of Object.entries(context.facts)) {
    if (typeof keys === 'object' && keys !== null && !Array.isArray(keys)) {
      for (const [key, stored] of Object.entries(keys as Record<string, unknown>)) {
        if (stored !== null && typeof stored === 'object' && 'value' in (stored as object)) {
          factsLines.push(`${cat} / ${key}: ${String((stored as { value: unknown }).value)}`)
        }
      }
    }
  }
  parts.push(
    `## Known facts for this project\n\n${factsLines.length > 0 ? factsLines.join('\n') : 'No facts recorded yet.'}`,
  )

  // Open jobs for the matched room, if any. Used for dedup detection.
  const jobLines = context.openJobs.map(
    (j) =>
      `${j.id} | ${j.intent} | ${j.description} | owner: ${j.owner ?? 'unassigned'} | due: ${j.due ?? 'none'}`,
  )
  parts.push(
    `## Open jobs you may be acting on\n\n${jobLines.length > 0 ? jobLines.join('\n') : 'No open jobs.'}`,
  )

  // Connected address: the user who authored this email
  if (context.connectedAddress) {
    parts.push(`## User's connected address\n\n${context.connectedAddress}`)
  }

  // Room hierarchy for room_suggestions
  const roomTreeText = formatRoomTree(context.rooms)
  parts.push(`## Existing rooms in this workspace\n\n${roomTreeText.slice(0, 3000)}`)

  return parts.join('\n\n---\n\n')
}

// ---- Proactive creation prompt (Brief 38) ----
//
// Used when Matt emails Croft directly to set up rooms before any project email exists.
// The model extracts rooms, seed facts, and watch context. No job reconciliation.
// Prompt caching is not needed here: these calls are low-frequency and not batched.

export const PROACTIVE_CREATION_SYSTEM_PROMPT = `You are reading an email the user sent to Croft to set up project rooms before any email thread has started.

Your job is to extract the rooms they want to create. For each room, extract:
- Its name (concise, suitable as a project room label)
- Any parent room grouping (if the user lists multiple events or dates under a heading, that heading is the parent)
- Seed facts (date, venue, location, amounts, specifications -- anything concrete the user stated)
- Watch context (contacts they mentioned, topics or signals to listen for, and items they are anticipating receiving or confirming)

## Single vs batch creation

If the user describes a single project, return one room.

If the user lists multiple rooms under a parent heading (e.g. "November tour -- here are the dates", "Setting up rooms for my Q4 run:"), create one parent room with the heading as its name, and one child room per listed item. The parent_name field on each child should match the parent room's name exactly.

## Seed facts

Seed facts are things the user states directly: dates, venues, capacities, fees, reference numbers. Do not infer facts not explicitly stated. If the user says "Manchester Apollo, November 3rd", extract:
- kind: place, key: venue, value: Manchester Apollo
- kind: time, key: date, value: November 3rd

## Watch context

contacts: email addresses or plain names the user mentioned as expected participants. Include both.
keywords: topics, project-specific terms, or signal phrases the user listed ("stage plot", "hospitality rider", "insurance certificate").
anticipated: items the user expects to receive or confirm. Each has a description (the user's own words) and a kind.

## Anticipated item kinds

document: a file, report, specification, or form the user expects to receive.
confirmation: an agreement, approval, or acknowledgement the user is waiting for.
information: a piece of data or answer the user needs (capacity, dates, contacts).
payment: a fee, invoice, or financial transfer the user expects.
other: anything that does not fit the above.

## For a batch

When the user mentions items that apply to all rooms in the batch ("for all three: stage plots, riders, and contracts"), include those anticipated items in the watch context of each child room. Also union all child watch contexts into the parent room's watch context.

## Output

Use the create_proactive_rooms tool to return your structured output. Do not return free text.`

export interface WatchContext {
  contacts: string[]
  keywords: string[]
  anticipated: {
    description: string
    kind: 'document' | 'confirmation' | 'information' | 'payment' | 'other'
  }[]
}

export interface ProactiveSeedFact {
  key: string
  value: string
  kind: 'place' | 'time' | 'money' | 'credential' | 'spec' | 'other'
  confidence: number
}

export interface ProactiveRoom {
  name: string
  parent_name?: string
  seed_facts: ProactiveSeedFact[]
  watch_context: WatchContext
}

export interface ProactiveCreationOutput {
  rooms: ProactiveRoom[]
}

export const PROACTIVE_CREATION_TOOL_SCHEMA = {
  name: 'create_proactive_rooms',
  description: 'Return the rooms, seed facts, and watch context extracted from the user\'s email.',
  input_schema: {
    type: 'object' as const,
    properties: {
      rooms: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Room name, concise and suitable as a project label.' },
            parent_name: {
              type: 'string',
              description: 'Name of the parent room if this is a child in a batch. Omit for single rooms and the parent itself.',
            },
            seed_facts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: 'Short snake_case label for this fact.' },
                  value: { type: 'string', description: 'Fact value exactly as stated.' },
                  kind: {
                    type: 'string',
                    enum: ['place', 'time', 'money', 'credential', 'spec', 'other'],
                  },
                  confidence: { type: 'number', description: '0-1 extraction confidence.' },
                },
                required: ['key', 'value', 'kind', 'confidence'],
              },
            },
            watch_context: {
              type: 'object',
              properties: {
                contacts: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Email addresses or plain names the user mentioned as expected participants.',
                },
                keywords: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Topics or signal phrases to listen for in future inbound emails.',
                },
                anticipated: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      description: { type: 'string' },
                      kind: {
                        type: 'string',
                        enum: ['document', 'confirmation', 'information', 'payment', 'other'],
                      },
                    },
                    required: ['description', 'kind'],
                  },
                },
              },
              required: ['contacts', 'keywords', 'anticipated'],
            },
          },
          required: ['name', 'seed_facts', 'watch_context'],
        },
      },
    },
    required: ['rooms'],
  },
}

export function buildProactiveCreationContent(emailBody: string, subject: string | null): string {
  const body = emailBody.split(/\s+/).slice(0, 1500).join(' ')
  return `Subject: ${subject ?? '(no subject)'}

${body}`
}
