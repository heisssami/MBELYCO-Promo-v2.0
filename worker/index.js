import { Worker } from 'bullmq'
import Redis from 'ioredis'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true })
const concurrency = Number(process.env.WORKER_CONCURRENCY || 5)

const worker = new Worker(
  'disbursements',
  async (job) => {
    logger.info({ jobId: job.id, data: job.data }, 'disbursement job received')
  },
  {
    connection: redis,
    concurrency,
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  }
)

worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err?.message }, 'job failed'))
worker.on('completed', (job) => logger.info({ jobId: job.id }, 'job completed'))
