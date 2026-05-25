import { z } from 'zod'

const ResendAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string().nullable(),
  content_type: z.string(),
  content_disposition: z.string().nullable(),
  content_id: z.string().nullable(),
})

export const ResendInboundEventSchema = z.object({
  type: z.literal('email.received'),
  created_at: z.string(),
  data: z.object({
    email_id: z.string(),
    created_at: z.string(),
    from: z.string(),
    to: z.array(z.string()),
    bcc: z.array(z.string()),
    cc: z.array(z.string()),
    message_id: z.string(),
    subject: z.string(),
    text: z.string().nullable().optional(),
    html: z.string().nullable().optional(),
    attachments: z.array(ResendAttachmentSchema),
  }),
})

export type ResendInboundEvent = z.infer<typeof ResendInboundEventSchema>
