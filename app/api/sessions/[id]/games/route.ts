import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateEloUpdates, getWinner } from '@/lib/elo'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/sessions/[id]/games - Get all games for a session
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  const games = await prisma.game.findMany({
    where: { sessionId: id },
    include: {
      teamAPlayers: true,
      teamBPlayers: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(games)
}

// POST /api/sessions/[id]/games - Add a new game with ELO updates
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { teamAPlayerIds, teamBPlayerIds, scoreA, scoreB } = body

    // Validate input
    if (!Array.isArray(teamAPlayerIds) || !Array.isArray(teamBPlayerIds)) {
      return NextResponse.json(
        { error: 'teamAPlayerIds and teamBPlayerIds arrays are required' },
        { status: 400 }
      )
    }

    if (typeof scoreA !== 'number' || typeof scoreB !== 'number') {
      return NextResponse.json(
        { error: 'scoreA and scoreB are required' },
        { status: 400 }
      )
    }

    if (scoreA === scoreB) {
      return NextResponse.json(
        { error: 'Games cannot end in a tie' },
        { status: 400 }
      )
    }

    // Verify session exists and is in progress
    const session = await prisma.session.findUnique({ where: { id } })
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Get current player ratings
    const teamAPlayers = await prisma.player.findMany({
      where: { id: { in: teamAPlayerIds } },
    })

    const teamBPlayers = await prisma.player.findMany({
      where: { id: { in: teamBPlayerIds } },
    })

    // Calculate ELO updates
    const winner = getWinner(scoreA, scoreB)
    const { teamAUpdates, teamBUpdates } = calculateEloUpdates(
      teamAPlayers.map((p) => ({ id: p.id, rating: p.rating })),
      teamBPlayers.map((p) => ({ id: p.id, rating: p.rating })),
      winner
    )

    // Create game and update ratings in a transaction
    const game = await prisma.$transaction(async (tx) => {
      // Create the game
      const newGame = await tx.game.create({
        data: {
          sessionId: id,
          scoreA,
          scoreB,
          teamAPlayers: {
            connect: teamAPlayerIds.map((pid: string) => ({ id: pid })),
          },
          teamBPlayers: {
            connect: teamBPlayerIds.map((pid: string) => ({ id: pid })),
          },
        },
        include: {
          teamAPlayers: true,
          teamBPlayers: true,
        },
      })

      // Update player ratings and create history
      for (const update of [...teamAUpdates, ...teamBUpdates]) {
        await tx.player.update({
          where: { id: update.playerId },
          data: { rating: update.ratingAfter },
        })

        await tx.ratingHistory.create({
          data: {
            playerId: update.playerId,
            sessionId: id,
            gameId: newGame.id,
            ratingBefore: update.ratingBefore,
            ratingAfter: update.ratingAfter,
          },
        })
      }

      return newGame
    })

    return NextResponse.json(game, { status: 201 })
  } catch (error) {
    console.error('Error creating game:', error)
    return NextResponse.json(
      { error: 'Failed to create game' },
      { status: 500 }
    )
  }
}

