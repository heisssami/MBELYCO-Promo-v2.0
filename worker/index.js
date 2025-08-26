const { Worker, Queue } = require('bullmq')
const Redis = require('ioredis')
const pino = require('pino')
const { PrismaClient } = require('@prisma/client')

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true })
const concurrency = Number(process.env.WORKER_CONCURRENCY || 5)
const prisma = new PrismaClient()
const dlq = new Queue('disbursements:dlq', { connection: redis })

async function useRealMomo() {
  const baseUrl = process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com'
  const apiUser = process.env.MOMO_API_USER || ''
  const apiKey = process.env.MOMO_API_KEY || ''
  const subscriptionKey = process.env.MOMO_SUBSCRIPTION_KEY || ''
  const targetEnv = process.env.MOMO_TARGET_ENV || 'sandbox'
  if (!apiUser || !apiKey || !subscriptionKey) return null
  const client = require('./momoClient.js')
  return { baseUrl, apiUser, apiKey, subscriptionKey, targetEnv, client }
}

const worker = new Worker(
  'disbursements',
  async (job) => {
    const { redemptionId } = job.data
    logger.info({ jobId: job.id, redemptionId }, 'disbursement job received')

    const redemption = await prisma.redemption.findUnique({
      where: { id: redemptionId },
      include: { promoCode: true, user: true },
    })
    if (!redemption) {
      logger.warn({ redemptionId }, 'redemption not found')
      return
    }

    const reference = `MBELYCO-${redemption.id}`
    const real = await useRealMomo()

    if (real) {
      const { baseUrl, apiUser, apiKey, subscriptionKey, targetEnv, client } = real
      const amount = String(redemption.amount)
      await prisma.$transaction(async (tx) => {
        await tx.disbursement.create({
          data: {
            redemptionId: redemption.id,
            momoReference: reference,
            amount: redemption.amount,
            currency: redemption.currency,
            status: 'pending',
            phoneNumber: redemption.phoneNumber,
          },
        })
        await tx.redemption.update({
          where: { id: redemption.id },
          data: {
            status: 'pending',
            momoReference: reference,
          },
        })
      })

      try {
        const token = await client.getAccessToken({ baseUrl, apiUser, apiKey, subscriptionKey })
        await client.transfer({
          baseUrl,
          subscriptionKey,
          targetEnv,
          token,
          referenceId: reference,
          amount,
          currency: redemption.currency,
          payeeMsisdn: redemption.phoneNumber.replace('+', ''),
          externalId: reference,
          payerMessage: 'MBELYCO',
          payeeNote: 'Promo',
        })
      } catch (e) {
        await prisma.disbursement.updateMany({
          where: { momoReference: reference },
          data: { retryCount: { increment: 1 }, errorMessage: String((e && e.message) || 'momo transfer error') },
        })
        throw new Error((e && e.message) || 'momo transfer error')
      }
      return
    }

    await prisma.$transaction(async (tx) => {
      await tx.disbursement.create({
        data: {
          redemptionId: redemption.id,
          momoTransactionId: `sandbox-${Date.now()}`,
          momoReference: reference,
          amount: redemption.amount,
          currency: redemption.currency,
          status: 'success',
          phoneNumber: redemption.phoneNumber,
          processedAt: new Date(),
        },
      })
      await tx.redemption.update({
        where: { id: redemption.id },
        data: {
          status: 'disbursed',
          momoTransactionId: `sandbox-${Date.now()}`,
          momoReference: reference,
          disbursedAt: new Date(),
        },
      })
    })
  },
  {
    connection: redis,
    concurrency,
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  }
)

worker.on('failed', async (job, err) => {
  const attempts = job?.attemptsMade || 0
  const max = job?.opts?.attempts || 0
  if (attempts >= max) {
    try {
      await dlq.add('dead', job?.data || {}, { removeOnComplete: true })
    } catch {}
  }
  logger.error({ jobId: job?.id, err: err?.message }, 'job failed')
})
worker.on('completed', (job) => logger.info({ jobId: job.id }, 'job completed'))
