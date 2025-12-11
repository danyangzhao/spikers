import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/sessions/[id]/attendance - Get attendance for a session
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  const attendances = await prisma.attendance.findMany({
    where: { sessionId: id },
    include: { player: true },
  })

  return NextResponse.json(attendances)
}

// POST /api/sessions/[id]/attendance - Set attendance (bulk upsert)
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { playerIds } = body as { playerIds: string[] }

    if (!Array.isArray(playerIds)) {
      return NextResponse.json(
        { error: 'playerIds array is required' },
        { status: 400 }
      )
    }

    // Verify session exists
    const session = await prisma.session.findUnique({ where: { id } })
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Get all players to process
    const allPlayers = await prisma.player.findMany({
      where: { isActive: true },
    })

    // Upsert attendance for each player
    const operations = allPlayers.map((player) =>
      prisma.attendance.upsert({
        where: {
          sessionId_playerId: {
            sessionId: id,
            playerId: player.id,
          },
        },
        update: {
          present: playerIds.includes(player.id),
        },
        create: {
          sessionId: id,
          playerId: player.id,
          present: playerIds.includes(player.id),
        },
      })
    )

    await prisma.$transaction(operations)

    // Return updated attendance
    const attendances = await prisma.attendance.findMany({
      where: { sessionId: id },
      include: { player: true },
    })

    return NextResponse.json(attendances)
  } catch (error) {
    console.error('Error updating attendance:', error)
    return NextResponse.json(
      { error: 'Failed to update attendance' },
      { status: 500 }
    )
  }
}

