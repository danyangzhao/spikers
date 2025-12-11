import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/players/[id] - Get a single player
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      playerBadges: {
        include: { badge: true },
      },
    },
  })

  if (!player) {
    return NextResponse.json(
      { error: 'Player not found' },
      { status: 404 }
    )
  }

  return NextResponse.json(player)
}

// PATCH /api/players/[id] - Update a player
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { name, emoji, isActive } = body

    const player = await prisma.player.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(emoji !== undefined && { emoji }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json(player)
  } catch (error) {
    console.error('Error updating player:', error)
    return NextResponse.json(
      { error: 'Failed to update player' },
      { status: 500 }
    )
  }
}

