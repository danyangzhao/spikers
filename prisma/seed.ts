import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const badges = [
  // --- Existing badges ---
  {
    code: 'TOURNAMENT_WINNER',
    name: 'Tournament Winner',
    description: 'Won a tournament',
    iconEmoji: '🥇',
  },
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
    description: 'Lost first 2+ games but finished with a winning record',
    iconEmoji: '🦸',
  },
  // --- Milestone badges ---
  {
    code: 'VETERAN',
    name: 'Veteran',
    description: 'Played 25 total games',
    iconEmoji: '⭐',
  },
  {
    code: 'HALF_CENTURY',
    name: 'Half Century',
    description: 'Played 50 total games',
    iconEmoji: '🌟',
  },
  {
    code: 'REGULAR',
    name: 'Regular',
    description: 'Attended 10 sessions',
    iconEmoji: '📅',
  },
  {
    code: 'DEDICATED',
    name: 'Dedicated',
    description: 'Attended 25 sessions',
    iconEmoji: '🎯',
  },
  {
    code: 'ON_FIRE',
    name: 'On Fire',
    description: '10+ session attendance streak',
    iconEmoji: '🔥',
  },
  // --- Performance badges ---
  {
    code: 'SHUTOUT',
    name: 'Shutout',
    description: 'Won a game where opponent scored 0',
    iconEmoji: '🚫',
  },
  {
    code: 'NAIL_BITER',
    name: 'Nail Biter',
    description: 'Won a game by exactly 1 point',
    iconEmoji: '😬',
  },
  {
    code: 'DOMINANT',
    name: 'Dominant',
    description: 'Won a game by 10+ points',
    iconEmoji: '💪',
  },
  // --- Social badges ---
  {
    code: 'MIXER',
    name: 'Mixer',
    description: 'Played with 20 unique teammates',
    iconEmoji: '🤝',
  },
  {
    code: 'RIVAL',
    name: 'Rival',
    description: 'Played 10+ games against the same opponents',
    iconEmoji: '⚔️',
  },
  {
    code: 'DYNAMIC_DUO',
    name: 'Dynamic Duo',
    description: 'Won 10+ games with the same partner',
    iconEmoji: '🤜',
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

