import { NextRequest, NextResponse } from 'next/server'
import { acquireRedemptionLock, releaseRedemptionLock } from '@/lib/idempotency'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const sessionId = body?.sessionId || ''
  const phoneNumber = body?.phoneNumber || ''
  const text = body?.text || ''
  if (!sessionId || !phoneNumber) return new NextResponse('END Invalid request', { status: 400, headers: { 'Content-Type': 'text/plain' } })
  const input = typeof text === 'string' && text.length > 0 ? text.split('*').pop() || '' : ''
  if (!input) return new NextResponse('CON Enter promo code', { headers: { 'Content-Type': 'text/plain' } })
  if (input.length >= 19) {
    const lock = await acquireRedemptionLock(input, phoneNumber)
    if (!lock) return new NextResponse('END Code has already been redeemed.', { headers: { 'Content-Type': 'text/plain' } })
    await releaseRedemptionLock(input, phoneNumber)
    return new NextResponse('END Success! You will receive mobile money shortly.', { headers: { 'Content-Type': 'text/plain' } })
  }
  return new NextResponse('CON Enter promo code', { headers: { 'Content-Type': 'text/plain' } })
}
