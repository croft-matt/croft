import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Inbound webhook: 100 requests per 10 seconds per IP.
// Generous limit — legitimate forwarding volume should never hit this.
export const inboundRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '10 s'),
  prefix: 'croft:inbound',
})

// Outbound sends: 60 per hour per workspace.
export const sendRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 h'),
  prefix: 'croft:send',
})

// Interactive AI calls (/api/ask, /api/nudge): 20 per minute per workspace.
export const aiInteractiveRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'croft:ai',
})
