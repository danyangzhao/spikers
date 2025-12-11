import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionAwards } from '@/lib/stats'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/sessions/[id]/summary - Get session summary with awards
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  // Verify session exists
  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      attendances: {
        where: { present: true },
        include: { player: true },
      },
    },
  })

  if (!session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    )
  }

  // Get awards and stats
  const awards = await getSessionAwards(id)

  return NextResponse.json({
    session: {
      id: session.id,
      date: session.date,
      location: session.location,
      status: session.status,
    },
    playersPresent: session.attendances.map((a) => ({
      id: a.player.id,
      name: a.player.name,
      emoji: a.player.emoji,
    })),
    ...awards,
  })
}

