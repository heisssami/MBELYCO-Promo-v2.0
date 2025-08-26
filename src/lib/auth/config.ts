import { prisma } from '../../lib/db'
import bcrypt from 'bcryptjs'

export async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash)
}

export async function getUserWithPermissionsByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  })
  if (!user || !user.isActive) return null
  const roleTitle = user.role?.title || null
  const permissions =
    user.role?.rolePermissions.map((rp) => rp.permission.title) || []
  return {
    id: user.id,
    email: user.email,
    role: roleTitle,
    permissions,
  }
}
