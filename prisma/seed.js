const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const adminRole = await prisma.userRole.upsert({
    where: { title: 'admin' },
    update: {},
    create: { title: 'admin', description: 'System administrator' },
  })

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      phoneNumber: '+250780000000',
      firstName: 'System',
      lastName: 'Admin',
      roleId: adminRole.id,
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
