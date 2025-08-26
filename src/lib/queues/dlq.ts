import { Queue } from 'bullmq'
import { redis } from '../redis'

export const dlqDisbursementQueue = new Queue('disbursements:dlq', { connection: redis })
