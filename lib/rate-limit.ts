import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export const loginRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'ratelimit:login',
})

export const barcodeLookupRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'ratelimit:barcode-lookup',
})

export async function checkRateLimit(limiter: Ratelimit, identifier: string): Promise<{ allowed: boolean }> {
  const { success } = await limiter.limit(identifier)
  return { allowed: success }
}
