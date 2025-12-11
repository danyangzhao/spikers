import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const badges = [
  {
    code: 'EARLY_BIRD',
    name: 'Early Bird',
    description: 'Attended 3 consecutive sessions',
    iconEmoji: '🐦',
  },
  {
    code: 'MARATHONER',
    name: 'Marathoner',
    description: 'Played 10+ games in a single session',
    iconEmoji: '🏃',
  },
  {
    code: 'SOCIAL_BUTTERFLY',
    name: 'Social Butterfly',
    description: 'Played with 5+ different teammates in one session',
    iconEmoji: '🦋',
  },
  {
    code: 'STREAK_BEAST',
    name: 'Streak Beast',
    description: '5+ session attendance streak',
    iconEmoji: '🔥',
  },
  {
    code: 'CENTURY_CLUB',
    name: 'Century Club',
    description: 'Played 100 total games',
    iconEmoji: '💯',
  },
  {
    code: 'FIRST_WIN',
    name: 'First Win',
    description: 'Won your first game',
    iconEmoji: '🏆',
  },
  {
    code: 'UNDEFEATED',
    name: 'Undefeated',
    description: 'Won all games in a session (min 3 games)',
    iconEmoji: '👑',
  },
  {
    code: 'COMEBACK_KING',
    name: 'Comeback King',
    description: 'Won after trailing by 5+ points',
    iconEmoji: '🦸',
  },
]

async function main() {
  console.log('Seeding badges...')
  
  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { code: badge.code },
      update: badge,
      create: badge,
    })
  }
  
  console.log('Badges seeded successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

