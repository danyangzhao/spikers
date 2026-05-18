import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const BASE_ELO = 1000

type TxClient = Prisma.TransactionClient

interface StartNewSeasonInput {
  groupId: string
  name?: string
  carryOverPlayerIds: string[]
  scheduledStartAt?: Date
}

interface ComputedStanding {
  playerId: string
  finalRating: number
  gamesPlayed: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  longestWinStreak: number
}

export async function getActiveSeason(groupId: string) {
  await activateDueScheduledSeason(groupId)
  return prisma.season.findFirst({
    where: { groupId, isActive: true },
    orderBy: { number: 'desc' },
  })
}

export async function listSeasons(groupId: string) {
  await activateDueScheduledSeason(groupId)
  return prisma.season.findMany({
    where: { groupId },
    orderBy: { number: 'desc' },
  })
}

export async function startNewSeason(input: StartNewSeasonInput) {
  const { groupId, name, carryOverPlayerIds, scheduledStartAt } = input

  if (!carryOverPlayerIds.length) {
    throw new Error('carryOverPlayerIds must include at least one player')
  }

  const dedupedCarryOverIds = Array.from(new Set(carryOverPlayerIds))
  const carryOverPlayers = await prisma.player.findMany({
    where: {
      groupId,
      id: { in: dedupedCarryOverIds },
    },
    select: { id: true },
  })

  if (carryOverPlayers.length !== dedupedCarryOverIds.length) {
    throw new Error('One or more carryOverPlayerIds are invalid for this group')
  }

  return prisma.$transaction(async (tx) => {
    await activateDueScheduledSeason(groupId, tx)

    let activeSeason = await tx.season.findFirst({
      where: { groupId, isActive: true },
      orderBy: { number: 'desc' },
    })

    if (!activeSeason) {
      activeSeason = await tx.season.create({
        data: {
          groupId,
          number: 1,
          name: 'Season 1',
          isActive: true,
          scheduledStartAt: null,
          announcedAt: null,
        },
      })
    }

    const newSeasonNumber = activeSeason.number + 1
    const trimmedName = name?.trim()
    const hasFutureSchedule = Boolean(scheduledStartAt && scheduledStartAt.getTime() > Date.now())

    if (hasFutureSchedule && scheduledStartAt) {
      const existingAnnouncement = await tx.season.findFirst({
        where: {
          groupId,
          isActive: false,
          endedAt: null,
          scheduledStartAt: { gt: new Date() },
        },
      })

      if (existingAnnouncement) {
        throw new Error('A future season is already announced for this group')
      }

      return tx.season.create({
        data: {
          groupId,
          number: newSeasonNumber,
          name: trimmedName || `Season ${newSeasonNumber}`,
          isActive: false,
          startedAt: scheduledStartAt,
          scheduledStartAt,
          announcedAt: new Date(),
          endedAt: null,
        },
      })
    }

    await snapshotSeasonStandings(tx, groupId, activeSeason.id)

    await tx.season.update({
      where: { id: activeSeason.id },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    })

    const newSeason = await tx.season.create({
      data: {
        groupId,
        number: newSeasonNumber,
        name: trimmedName || `Season ${newSeasonNumber}`,
        isActive: true,
        scheduledStartAt: null,
        announcedAt: null,
      },
    })

    await tx.player.updateMany({
      where: {
        groupId,
        id: { in: dedupedCarryOverIds },
      },
      data: {
        rating: BASE_ELO,
        isActive: true,
      },
    })

    await tx.player.updateMany({
      where: {
        groupId,
        id: { notIn: dedupedCarryOverIds },
      },
      data: {
        isActive: false,
      },
    })

    return newSeason
  })
}

async function activateDueScheduledSeason(groupId: string, txClient?: TxClient) {
  const now = new Date()
  const db = txClient ?? prisma
  const dueSeason = await db.season.findFirst({
    where: {
      groupId,
      isActive: false,
      endedAt: null,
      scheduledStartAt: { lte: now },
    },
    orderBy: { scheduledStartAt: 'asc' },
  })

  if (!dueSeason) return null

  const activateInTransaction = async (tx: TxClient) => {
    const activeSeason = await tx.season.findFirst({
      where: { groupId, isActive: true },
      orderBy: { number: 'desc' },
    })

    if (activeSeason && activeSeason.id !== dueSeason.id) {
      await snapshotSeasonStandings(tx, groupId, activeSeason.id)
      await tx.season.update({
        where: { id: activeSeason.id },
        data: {
          isActive: false,
          endedAt: dueSeason.scheduledStartAt ?? now,
        },
      })
    }

    return tx.season.update({
      where: { id: dueSeason.id },
      data: {
        isActive: true,
      },
    })
  }

  if (txClient) {
    return activateInTransaction(txClient)
  }

  return prisma.$transaction(async (tx) => activateInTransaction(tx))
}

async function snapshotSeasonStandings(tx: TxClient, groupId: string, seasonId: string) {
  const [players, games] = await Promise.all([
    tx.player.findMany({
      where: { groupId },
      select: {
        id: true,
        rating: true,
      },
    }),
    tx.game.findMany({
      where: {
        session: {
          seasonId,
          groupId,
        },
      },
      include: {
        teamAPlayers: {
          select: { id: true },
        },
        teamBPlayers: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const standings = buildSeasonStandings(players, games)
  if (!standings.length) return

  await tx.seasonStanding.createMany({
    data: standings.map((standing, index) => ({
      seasonId,
      playerId: standing.playerId,
      finalRating: standing.finalRating,
      gamesPlayed: standing.gamesPlayed,
      wins: standing.wins,
      losses: standing.losses,
      pointsFor: standing.pointsFor,
      pointsAgainst: standing.pointsAgainst,
      longestWinStreak: standing.longestWinStreak,
      rank: index + 1,
    })),
  })
}

function buildSeasonStandings(
  players: Array<{ id: string; rating: number }>,
  games: Array<{
    scoreA: number
    scoreB: number
    teamAPlayers: Array<{ id: string }>
    teamBPlayers: Array<{ id: string }>
  }>
): ComputedStanding[] {
  const standings = new Map<string, ComputedStanding & { currentWinStreak: number }>()

  for (const player of players) {
    standings.set(player.id, {
      playerId: player.id,
      finalRating: player.rating,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      longestWinStreak: 0,
      currentWinStreak: 0,
    })
  }

  for (const game of games) {
    for (const player of game.teamAPlayers) {
      const standing = standings.get(player.id)
      if (!standing) continue
      const didWin = game.scoreA > game.scoreB
      updateStanding(standing, didWin, game.scoreA, game.scoreB)
    }

    for (const player of game.teamBPlayers) {
      const standing = standings.get(player.id)
      if (!standing) continue
      const didWin = game.scoreB > game.scoreA
      updateStanding(standing, didWin, game.scoreB, game.scoreA)
    }
  }

  return Array.from(standings.values())
    .sort((a, b) => {
      if (b.finalRating !== a.finalRating) return b.finalRating - a.finalRating
      if (b.wins !== a.wins) return b.wins - a.wins
      return b.pointsFor - a.pointsFor
    })
    .map((standing) => {
      const { currentWinStreak, ...serializableStanding } = standing
      void currentWinStreak
      return serializableStanding
    })
}

function updateStanding(
  standing: ComputedStanding & { currentWinStreak: number },
  didWin: boolean,
  pointsFor: number,
  pointsAgainst: number
) {
  standing.gamesPlayed += 1
  standing.pointsFor += pointsFor
  standing.pointsAgainst += pointsAgainst

  if (didWin) {
    standing.wins += 1
    standing.currentWinStreak += 1
    standing.longestWinStreak = Math.max(standing.longestWinStreak, standing.currentWinStreak)
    return
  }

  standing.losses += 1
  standing.currentWinStreak = 0
}

export async function getSeasonById(groupId: string, seasonId: string) {
  await activateDueScheduledSeason(groupId)
  return prisma.season.findFirst({
    where: {
      id: seasonId,
      groupId,
    },
    include: {
      standings: {
        include: {
          player: {
            select: {
              id: true,
              name: true,
              emoji: true,
            },
          },
        },
        orderBy: { rank: 'asc' },
      },
      sessions: {
        orderBy: { date: 'desc' },
        include: {
          _count: {
            select: {
              games: true,
              attendances: {
                where: { present: true },
              },
            },
          },
        },
      },
      badges: {
        include: {
          badge: true,
          player: {
            select: {
              id: true,
              name: true,
              emoji: true,
            },
          },
        },
        orderBy: { earnedAt: 'desc' },
      },
    },
  })
}

