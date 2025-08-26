import { prisma } from './db'

export async function auditLog(params: {
  userId?: number
  action: string
  entityType: string
  entityId?: number
  oldValues?: unknown
  newValues?: unknown
  ipAddress?: string
  userAgent?: string
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      oldValues: params.oldValues as any,
      newValues: params.newValues as any,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  })
}
