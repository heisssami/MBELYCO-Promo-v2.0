import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const subKey = process.env.MOMO_SUBSCRIPTION_KEY || ''
  const headerKey = req.headers.get('Ocp-Apim-Subscription-Key') || req.headers.get('ocp-apim-subscription-key') || ''
  if (subKey && headerKey !== subKey) {
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
