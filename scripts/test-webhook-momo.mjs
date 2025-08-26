import { setTimeout as wait } from 'node:timers/promises'

async function waitForServer(url = 'http://localhost:3000/api/health', retries = 120) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {}
    await wait(1000)
  }
  throw new Error('Server did not become ready')
}

async function main() {
  await waitForServer()

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  const user = await prisma.user.upsert({
    where: { phoneNumber: '+250780001234' },
    update: {},
    create: {
      email: 'webhook@test.local',
      phoneNumber: '+250780001234',
      firstName: 'WH',
      lastName: 'Test',
    },
  })

  const promo = await prisma.promoCode.findFirst({ where: { status: 'active' } })
  if (!promo) throw new Error('No active promo code found')

  const redemption = await prisma.redemption.create({
    data: {
      promoCodeId: promo.id,
      userId: user.id,
      phoneNumber: user.phoneNumber,
      amount: promo.amount,
      currency: promo.currency,
      status: 'pending',
      redeemedAt: new Date(),
    },
  })

  const reference = `MBELYCO-${redemption.id}`

  await prisma.disbursement.create({
    data: {
      redemptionId: redemption.id,
      momoReference: reference,
      amount: redemption.amount,
      currency: redemption.currency,
      status: 'pending',
      phoneNumber: redemption.phoneNumber,
    },
  })

  const payload = {
    externalId: reference,
    financialTransactionId: 'sandbox-999999',
  }

  const headers = { 'Content-Type': 'application/json' }
  const sub = process.env.MOMO_SUBSCRIPTION_KEY
  if (sub) headers['Ocp-Apim-Subscription-Key'] = sub

  const url = 'http://localhost:3000/api/v1/webhooks/momo'
  const res1 = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
  if (!res1.ok) {
    const text = await res1.text()
    throw new Error(`Webhook 1 failed ${res1.status}: ${text}`)
  }
  const res2 = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
  if (!res2.ok) {
    const text = await res2.text()
    throw new Error(`Webhook 2 failed ${res2.status}: ${text}`)
  }

  const updated = await prisma.redemption.findUnique({
    where: { id: redemption.id },
    include: { disbursements: true },
  })

  if (!updated || updated.status !== 'disbursed') {
    throw new Error('Webhook did not mark redemption as disbursed')
  }
  const d = updated.disbursements?.find((x) => x.momoReference === reference)
  if (!d || d.status !== 'success') {
    throw new Error('Webhook did not mark disbursement as success')
  }

  console.log('MoMo webhook idempotency test passed')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
