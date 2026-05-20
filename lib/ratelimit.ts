import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
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
