import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { awardNewBadges } from '@/lib/stats'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/sessions/[id] - Get a single session with details
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      attendances: {
        include: { player: true },
      },
      rsvps: {
        include: { player: true },
      },
      games: {
        include: {
          teamAPlayers: true,
          teamBPlayers: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    )
  }

  return NextResponse.json(session)
}

// PATCH /api/sessions/[id] - Update a session
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { date, location, status } = body

    // Get current session to check status change
    const currentSession = await prisma.session.findUnique({
      where: { id },
      include: {
        attendances: { where: { present: true } },
      },
    })

    if (!currentSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    const session = await prisma.session.update({
      where: { id },
      data: {
        ...(date !== undefined && { date: new Date(date) }),
        ...(location !== undefined && { location }),
        ...(status !== undefined && { status }),
      },
    })

    // If session just completed, award badges to all attendees
    if (status === 'COMPLETED' && currentSession.status !== 'COMPLETED') {
      const attendeeIds = currentSession.attendances.map((a) => a.playerId)
      for (const playerId of attendeeIds) {
        await awardNewBadges(playerId)
      }
    }

    return NextResponse.json(session)
  } catch (error) {
    console.error('Error updating session:', error)
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    )
  }
}

