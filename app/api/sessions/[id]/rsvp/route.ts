import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/sessions/[id]/rsvp - Get RSVPs for a session
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  const rsvps = await prisma.rSVP.findMany({
    where: { sessionId: id },
    include: { player: true },
  })

  // Get all active players to show who hasn't RSVPed
  const allPlayers = await prisma.player.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })

  // Map with RSVP status (null if no RSVP)
  const playerRsvps = allPlayers.map((player) => {
    const rsvp = rsvps.find((r) => r.playerId === player.id)
    return {
      player,
      status: rsvp?.status || null,
      updatedAt: rsvp?.updatedAt || null,
    }
  })

  // Count summary
  const summary = {
    going: rsvps.filter((r) => r.status === 'GOING').length,
    maybe: rsvps.filter((r) => r.status === 'MAYBE').length,
    out: rsvps.filter((r) => r.status === 'OUT').length,
    noResponse: allPlayers.length - rsvps.length,
  }

  return NextResponse.json({ playerRsvps, summary })
}

// POST /api/sessions/[id]/rsvp - Set RSVP for a player
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { playerId, status } = body

    if (!playerId || !status) {
      return NextResponse.json(
        { error: 'playerId and status are required' },
        { status: 400 }
      )
    }

    if (!['GOING', 'MAYBE', 'OUT'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be GOING, MAYBE, or OUT' },
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

    // Upsert RSVP
    const rsvp = await prisma.rSVP.upsert({
      where: {
        sessionId_playerId: {
          sessionId: id,
          playerId,
        },
      },
      update: { status },
      create: {
        sessionId: id,
        playerId,
        status,
      },
      include: { player: true },
    })

    return NextResponse.json(rsvp)
  } catch (error) {
    console.error('Error updating RSVP:', error)
    return NextResponse.json(
      { error: 'Failed to update RSVP' },
      { status: 500 }
    )
  }
}

