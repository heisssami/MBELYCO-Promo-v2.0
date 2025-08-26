import { Worker } from 'bullmq'
import Redis from 'ioredis'
import pino from 'pino'
import { PrismaClient } from '@prisma/client'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true })
const concurrency = Number(process.env.WORKER_CONCURRENCY || 5)
const prisma = new PrismaClient()

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

worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err?.message }, 'job failed'))
worker.on('completed', (job) => logger.info({ jobId: job.id }, 'job completed'))
