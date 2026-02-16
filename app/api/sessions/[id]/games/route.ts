import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSessionGameWithElo } from '@/lib/gameCreation'

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
    const game = await createSessionGameWithElo({
      sessionId: id,
      teamAPlayerIds,
      teamBPlayerIds,
      scoreA,
      scoreB,
    })

    return NextResponse.json(game, { status: 201 })
  } catch (error) {
    console.error('Error creating game:', error)
    const message = error instanceof Error ? error.message : 'Failed to create game'
    const statusCode = message.includes('not found') ? 404 : message.includes('required') || message.includes('tie') ? 400 : 500
    return NextResponse.json(
      { error: message },
      { status: statusCode }
    )
  }
}

