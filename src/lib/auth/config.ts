import { prisma } from '../../lib/db'

export async function validateUser(params: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: params.email } })
  if (!user || !user.isActive) return null
  return { id: user.id, email: user.email, roleId: user.roleId }
}
