import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { acquireRedemptionLock, releaseRedemptionLock } from '@/lib/idempotency'
import { disbursementQueue } from '@/lib/queues/disbursement'
import { auditLog } from '@/lib/audit'
import { redis } from '@/lib/redis'
import crypto from 'crypto'

function respond(content: string, cont: boolean, status = 200) {
  return new NextResponse(`${cont ? 'CON' : 'END'} ${content}`, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  })
}

function normalizePhone(raw: string) {
  const s = String(raw || '').trim()
  if (s.startsWith('+')) return s
  return s
}

function parseLatestInput(text: string) {
  if (!text) return ''
  const parts = text.split('*')
  return parts[parts.length - 1]?.trim() || ''
}

function isValidCodeFormat(code: string) {
  return /^[A-Z0-9-]{10,30}$/.test(code)
}

function getClientIp(req: NextRequest) {
  const ipHeader = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
  return ipHeader.split(',')[0].trim()
}

function ipAllowed(req: NextRequest): boolean {
  const allowed = process.env.USSD_ALLOWED_IPS
  if (!allowed) return true
  const candidate = getClientIp(req)
  const list = allowed.split(',').map((x) => x.trim()).filter(Boolean)
  return list.length === 0 || list.includes(candidate)
}

type UssdBody = { sessionId?: string; phoneNumber?: string; text?: string; serviceCode?: string }

async function readUssdBody(req: NextRequest): Promise<UssdBody> {
  const ct = req.headers.get('content-type') || ''
  if (ct.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData()
    return {
      sessionId: String(form.get('sessionId') || ''),
      phoneNumber: String(form.get('phoneNumber') || ''),
      text: String(form.get('text') || ''),
      serviceCode: String(form.get('serviceCode') || ''),
    }
  }
  const json = await req.json().catch(() => ({} as any))
  return {
    sessionId: json?.sessionId || '',
    phoneNumber: json?.phoneNumber || '',
    text: json?.text || '',
    serviceCode: json?.serviceCode || '',
  }
}

function getSignatureHeader(req: NextRequest) {
  const configured = (process.env.USSD_SIGNATURE_HEADER || '').toLowerCase()
  if (configured) {
    return req.headers.get(configured) || ''
  }
  return (
    req.headers.get('x-signature') ||
    req.headers.get('x-ussd-signature') ||
    req.headers.get('x-at-signature') ||
    ''
  )
}

function verifyHmac(payload: UssdBody, signature: string) {
  const secret = process.env.USSD_HMAC_SECRET
  if (!secret) return true
  const canonical = [
    payload.sessionId || '',
    payload.phoneNumber || '',
    payload.serviceCode || '',
    payload.text || '',
  ].join('|')
  const h = crypto.createHmac('sha256', secret).update(canonical).digest('hex')
  try {
    const a = Buffer.from(h)
    const b = Buffer.from(String(signature || ''), 'utf8')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

async function rateLimit(key: string, limit = Number(process.env.RATE_LIMIT_USSD_PER_MIN || 5), windowSec = 60) {
  const k = `rl:ussd:${key}`
  const n = await redis.incr(k)
  if (n === 1) {
    await redis.expire(k, windowSec)
  }
  return n <= limit
}

export async function POST(req: NextRequest) {
  if (!ipAllowed(req)) {
    return respond('Unauthorized', false, 401)
  }

  const body = await readUssdBody(req)

  const signature = getSignatureHeader(req)
  if (process.env.USSD_HMAC_SECRET) {
    const ok = verifyHmac(body, signature || '')
    if (!ok) {
      return respond('Unauthorized', false, 401)
    }
  }

  const sessionId = body?.sessionId || ''
  const phone = normalizePhone(body?.phoneNumber || '')
  const text = body?.text || ''

  if (!sessionId) {
    return respond('Invalid request', false, 400)
  }

  const rateKey = phone || getClientIp(req)
  const withinLimit = await rateLimit(rateKey)
  if (!withinLimit) {
    return respond('Rate limit exceeded; try again shortly.', false, 429)
  }

  if (!phone) {
    return respond('Invalid request', false, 400)
  }

  const latest = parseLatestInput(String(text))
  if (!latest) {
    return respond('Enter promo code', true)
  }

  const codeInput = latest.replace(/\s+/g, '').toUpperCase()

  if (!isValidCodeFormat(codeInput)) {
    return respond('Invalid code format. Please re-enter code (e.g., ABCD-1234-5678)', true)
  }

  const acquired = await acquireRedemptionLock(codeInput, phone)
  if (!acquired) {
    return respond('A redemption is already in progress. Please try again shortly.', false)
  }

  try {
    const promo = await prisma.promoCode.findUnique({
      where: { code: codeInput },
      include: { batch: true },
    })

    if (!promo) {
      return respond('Code not found. Please check and try again.', false)
    }
    if (promo.status !== 'active') {
      return respond('This code is not active.', false)
    }
    if (promo.expiresAt && promo.expiresAt < new Date()) {
      return respond('This code has expired.', false)
    }
    if (promo.isReported) {
      return respond('This code has been reported and is blocked.', false)
    }
    if (promo.batch && promo.batch.status !== 'active') {
      return respond('This code’s batch is not active.', false)
    }

    const user = await prisma.user.upsert({
      where: { phoneNumber: phone },
      update: {},
      create: {
        email: `${phone}@auto.local`,
        phoneNumber: phone,
        firstName: 'USSD',
        lastName: 'User',
        isActive: true,
      },
    })

    const existingRedemption = await prisma.redemption.findFirst({
      where: {
        promoCodeId: promo.id,
        userId: user.id,
      },
    })
    if (existingRedemption) {
      return respond('You have already attempted to redeem this code.', false)
    }

    const redemption = await prisma.$transaction(async (tx) => {
      const updated = await tx.promoCode.update({
        where: { id: promo.id, code: promo.code },
        data: { status: 'redeemed' },
      })

      const r = await tx.redemption.create({
        data: {
          promoCodeId: updated.id,
          userId: user.id,
          phoneNumber: phone,
          amount: updated.amount,
          currency: updated.currency,
          status: 'initiated',
          redeemedAt: new Date(),
        },
      })

      return r
    })

    await disbursementQueue.add(
      'disburse',
      { redemptionId: redemption.id },
      { removeOnComplete: true, removeOnFail: false }
    )

    await auditLog({
      action: 'USSD_REDEMPTION_INIT',
      entityType: 'Redemption',
      entityId: redemption.id,
      newValues: { redemptionId: redemption.id },
    })

    return respond('Success! Your mobile money disbursement will arrive shortly.', false)
  } catch (e) {
    await auditLog({
      action: 'USSD_REDEMPTION_ERROR',
      entityType: 'PromoCode',
      newValues: { error: 'runtime' },
    })
    return respond('Something went wrong. Please try again later.', false)
  } finally {
    await releaseRedemptionLock(codeInput, phone)
  }
}
