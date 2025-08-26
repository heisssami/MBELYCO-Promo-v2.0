import { setTimeout as wait } from 'node:timers/promises'
import { Queue } from 'bullmq'
import Redis from 'ioredis'

async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) throw new Error('DATABASE_URL required')

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  const q = new Queue('disbursements', { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) })

  // Ensure a fresh redemption to process
  const user = await prisma.user.upsert({
    where: { phoneNumber: '+250788000999' },
    update: {},
    create: {
      email: 'phase4@test.local',
      phoneNumber: '+250788000999',
      firstName: 'Phase4',
      lastName: 'User',
    },
  })

  const promo = await prisma.promoCode.findFirst({ where: { status: 'active' } })
  if (!promo) throw new Error('No active promo code to use for worker test')

  const redemption = await prisma.redemption.create({
    data: {
      promoCodeId: promo.id,
      userId: user.id,
      phoneNumber: user.phoneNumber,
      amount: promo.amount,
      currency: promo.currency,
      status: 'initiated',
    },
  })

  await q.add('disburse', { redemptionId: redemption.id }, { removeOnComplete: true })

  // Poll for worker to update redemption status to 'disbursed' and create a disbursement row
  const timeoutMs = 40000
  const start = Date.now()
  let updated
  let lastLog = 0
  while (Date.now() - start < timeoutMs) {
    updated = await prisma.redemption.findUnique({
      where: { id: redemption.id },
      include: { disbursements: true },
    })
    if (updated?.status === 'disbursed' && (updated.disbursements?.length || 0) > 0) break
    const elapsed = Date.now() - start
    if (elapsed - lastLog >= 5000) {
      console.log(`Waiting for worker... elapsed=${Math.floor(elapsed / 1000)}s status=${updated?.status ?? 'n/a'} disbursements=${updated?.disbursements?.length ?? 0}`)
      lastLog = elapsed
    }
    await wait(500)
  }

  if (!updated || updated.status !== 'disbursed') {
    throw new Error('Worker did not mark redemption as disbursed in time')
  }
  if (!updated.disbursements || updated.disbursements.length === 0) {
    throw new Error('Worker did not create a Disbursement record')
  }

  console.log('Worker integration passed')
  await prisma.$disconnect()
  await q.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
