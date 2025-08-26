import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function getClientIp(req: NextRequest) {
  const ipHeader = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
  return ipHeader.split(',')[0].trim()
}

function ipAllowed(req: NextRequest): boolean {
  const allowed = process.env.MOMO_ALLOWED_IPS
  if (!allowed) return true
  const candidate = getClientIp(req)
  const list = allowed.split(',').map((x) => x.trim()).filter(Boolean)
  return list.length === 0 || list.includes(candidate)
}

export async function POST(req: NextRequest) {
  const subKey = process.env.MOMO_SUBSCRIPTION_KEY || ''
  const headerKey = req.headers.get('Ocp-Apim-Subscription-Key') || req.headers.get('ocp-apim-subscription-key') || ''
  if (subKey && headerKey !== subKey) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  if (!ipAllowed(req)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let payload: any = {}
  try {
    payload = await req.json()
  } catch {
    payload = {}
  }

  const ref = payload?.externalId || payload?.momoReference || payload?.reference || ''
  const txId = payload?.financialTransactionId || payload?.transactionId || ''
  if (!ref) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const disb = await prisma.disbursement.findFirst({ where: { momoReference: ref } })
  if (!disb) {
    return NextResponse.json({ ok: true })
  }

  if (disb.status === 'success') {
    return NextResponse.json({ ok: true })
  }

  await prisma.$transaction(async (tx) => {
    await tx.disbursement.update({
      where: { id: disb.id },
      data: {
        status: 'success',
        momoTransactionId: txId || disb.momoTransactionId,
        processedAt: new Date(),
      },
    })
    await tx.redemption.update({
      where: { id: disb.redemptionId },
      data: {
        status: 'disbursed',
        momoTransactionId: txId || undefined,
        momoReference: ref,
        disbursedAt: new Date(),
      },
    })
  })

  return NextResponse.json({ ok: true })
}
