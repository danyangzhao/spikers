import { prisma } from '@/lib/prisma'
import { calculateEloUpdates, getWinner } from '@/lib/elo'

interface CreateSessionGameInput {
  sessionId: string
  teamAPlayerIds: string[]
  teamBPlayerIds: string[]
  scoreA: number
  scoreB: number
}

export async function createSessionGameWithElo(input: CreateSessionGameInput) {
  const { sessionId, teamAPlayerIds, teamBPlayerIds, scoreA, scoreB } = input

  if (!Array.isArray(teamAPlayerIds) || !Array.isArray(teamBPlayerIds)) {
    throw new Error('teamAPlayerIds and teamBPlayerIds arrays are required')
  }
  if (typeof scoreA !== 'number' || typeof scoreB !== 'number') {
    throw new Error('scoreA and scoreB are required')
  }
  if (scoreA === scoreB) {
    throw new Error('Games cannot end in a tie')
  }

  const [session, teamAPlayers, teamBPlayers] = await Promise.all([
    prisma.session.findUnique({ where: { id: sessionId } }),
    prisma.player.findMany({ where: { id: { in: teamAPlayerIds } } }),
    prisma.player.findMany({ where: { id: { in: teamBPlayerIds } } }),
  ])

  if (!session) {
    throw new Error('Session not found')
  }
  if (teamAPlayers.length !== teamAPlayerIds.length || teamBPlayers.length !== teamBPlayerIds.length) {
    throw new Error('One or more players were not found')
  }

  const winner = getWinner(scoreA, scoreB)
  const { teamAUpdates, teamBUpdates } = calculateEloUpdates(
    teamAPlayers.map((p) => ({ id: p.id, rating: p.rating })),
    teamBPlayers.map((p) => ({ id: p.id, rating: p.rating })),
    winner
  )

  const game = await prisma.$transaction(async (tx) => {
    const newGame = await tx.game.create({
      data: {
        sessionId,
        scoreA,
        scoreB,
        teamAPlayers: {
          connect: teamAPlayerIds.map((pid) => ({ id: pid })),
        },
        teamBPlayers: {
          connect: teamBPlayerIds.map((pid) => ({ id: pid })),
        },
      },
      include: {
        teamAPlayers: true,
        teamBPlayers: true,
      },
    })

    const allUpdates = [...teamAUpdates, ...teamBUpdates]

    await Promise.all(
      allUpdates.map((update) =>
        tx.player.update({
          where: { id: update.playerId },
          data: { rating: update.ratingAfter },
        })
      )
    )

    await tx.ratingHistory.createMany({
      data: allUpdates.map((update) => ({
        playerId: update.playerId,
        sessionId,
        gameId: newGame.id,
        ratingBefore: update.ratingBefore,
        ratingAfter: update.ratingAfter,
      })),
    })

    return newGame
  })

  return game
}
