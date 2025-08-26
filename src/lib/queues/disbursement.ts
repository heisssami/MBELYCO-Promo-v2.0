import { Queue } from 'bullmq'
import { redis } from '../redis'

export const disbursementQueue = new Queue('disbursements', { connection: redis })

export type DisbursementJob = { redemptionId: number }
