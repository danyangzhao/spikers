import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const groups = await prisma.group.findMany({
    select: { id: true },
  })

  for (const group of groups) {
    const seasonOne = await prisma.season.upsert({
      where: {
        groupId_number: {
          groupId: group.id,
          number: 1,
        },
      },
      update: {},
      create: {
        groupId: group.id,
        number: 1,
        name: 'Season 1',
        isActive: true,
      },
    })

    await prisma.$executeRaw`
      UPDATE "Session"
      SET "seasonId" = ${seasonOne.id}
      WHERE "groupId" = ${group.id}
        AND "seasonId" IS NULL
    `

    await prisma.$executeRaw`
      UPDATE "PlayerBadge" pb
      SET "seasonId" = ${seasonOne.id}
      FROM "Player" p
      WHERE pb."playerId" = p."id"
        AND p."groupId" = ${group.id}
        AND pb."seasonId" IS NULL
    `
  }
}

main()
  .catch((error) => {
    console.error('Failed to seed season one:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
