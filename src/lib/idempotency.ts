import { redis } from './redis'

const TTL_SECONDS = 300

export async function acquireRedemptionLock(code: string, phone: string): Promise<boolean> {
  const key = `redemption:${code}:${phone}`
  const result = await redis.set(key, '1', 'EX', TTL_SECONDS, 'NX')
  return result === 'OK'
}

export async function releaseRedemptionLock(code: string, phone: string) {
  const key = `redemption:${code}:${phone}`
  await redis.del(key)
}
