const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function ensurePermissions() {
  const titles = [
    'users:read',
    'users:write',
    'batches:read',
    'batches:write',
    'promo-codes:read',
    'promo-codes:write',
    'redemptions:read',
    'disbursements:read',
    'reports:read',
  ]
  const results = []
  for (const title of titles) {
    const p = await prisma.permission.upsert({
      where: { title },
      update: {},
      create: { title },
    })
    results.push(p)
  }
  return results
}

async function attachAllPermissions(roleId, permissions) {
  for (const p of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId: p.id } },
      update: {},
      create: { roleId, permissionId: p.id },
    })
  }
}

async function main() {
  const allPerms = await ensurePermissions()

  const adminRole = await prisma.userRole.upsert({
    where: { title: 'admin' },
    update: {},
    create: { title: 'admin', description: 'System administrator' },
  })
  await attachAllPermissions(adminRole.id, allPerms)

  const passwordHash = await bcrypt.hash('ChangeMe!123', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { passwordHash, isActive: true },
    create: {
      email: 'admin@example.com',
      phoneNumber: '+250780000000',
      firstName: 'System',
      lastName: 'Admin',
      roleId: adminRole.id,
      isActive: true,
      passwordHash,
    },
  })

  const batch = await prisma.batch.upsert({
    where: { batchCode: 'DEMO-2025' },
    update: {},
    create: {
      batchCode: 'DEMO-2025',
      name: 'Demo Campaign 2025',
      totalCodes: 3,
      amountPerCode: 1000,
      currency: 'RWF',
      status: 'active',
      createdBy: admin.id,
    },
  })

  await prisma.promoCode.createMany({
    data: [
      { code: 'ABCD-2512-2512-2501', batchId: batch.id, amount: 1000, currency: 'RWF' },
      { code: 'EFGH-2512-2512-2502', batchId: batch.id, amount: 1000, currency: 'RWF' },
      { code: 'IJKL-2512-2512-2503', batchId: batch.id, amount: 1000, currency: 'RWF' },
    ],
    skipDuplicates: true,
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
