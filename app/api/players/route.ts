import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGroupId } from '@/lib/group'

// GET /api/players - List all players
export async function GET(request: NextRequest) {
  try {
    const groupId = getGroupId(request)
    if (groupId instanceof NextResponse) return groupId

    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('activeOnly') !== 'false'

    const players = await prisma.player.findMany({
      where: {
        groupId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(players)
  } catch (error) {
    console.error('Error fetching players:', error)
    return NextResponse.json(
      { error: 'Failed to fetch players', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST /api/players - Create a new player
export async function POST(request: NextRequest) {
  try {
    const groupId = getGroupId(request)
    if (groupId instanceof NextResponse) return groupId

    const body = await request.json()
    const { name, emoji } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const player = await prisma.player.create({
      data: {
        name: name.trim(),
        emoji: emoji || '🏐',
        groupId,
      },
    })

    return NextResponse.json(player, { status: 201 })
  } catch (error) {
    console.error('Error creating player:', error)
    return NextResponse.json(
      { error: 'Failed to create player', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
