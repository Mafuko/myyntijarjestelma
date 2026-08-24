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
  try {
    const { success } = await limiter.limit(identifier)
    return { allowed: success }
  } catch {
    // Fail CLOSED (deny) on any rate-limiter error, e.g. the Redis backend being
    // unreachable. This is a deliberate, user-approved trade-off -- never fail
    // open just because the limiter itself is unavailable.
    return { allowed: false }
  }
}
