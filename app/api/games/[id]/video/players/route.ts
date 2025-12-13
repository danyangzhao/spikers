import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Player colors for visualization in the annotation UI
const PLAYER_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'] // blue, green, amber, red

/**
 * GET /api/games/[id]/video/players
 * Get all tagged players for this video
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params

  try {
    const video = await prisma.gameVideo.findUnique({
      where: { gameId },
      include: {
        playerTags: {
          include: { player: true },
        },
      },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    return NextResponse.json(video.playerTags)
  } catch (error) {
    console.error('Error fetching player tags:', error)
    return NextResponse.json(
      { error: 'Failed to fetch player tags' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/games/[id]/video/players
 * Tag a player in the video (link a detected skeleton to a player)
 *
 * Request body:
 * - playerId: string (the player to tag)
 * - initialX: number (x position where clicked, normalized 0-1)
 * - initialY: number (y position where clicked, normalized 0-1)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params

  try {
    const video = await prisma.gameVideo.findUnique({
      where: { gameId },
      include: {
        playerTags: true,
        game: {
          include: {
            teamAPlayers: true,
            teamBPlayers: true,
          },
        },
      },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const body = await request.json()
    const { playerId, initialX, initialY } = body

    // Validate inputs
    if (!playerId) {
      return NextResponse.json(
        { error: 'playerId is required' },
        { status: 400 }
      )
    }

    if (
      typeof initialX !== 'number' ||
      typeof initialY !== 'number' ||
      initialX < 0 ||
      initialX > 1 ||
      initialY < 0 ||
      initialY > 1
    ) {
      return NextResponse.json(
        { error: 'initialX and initialY must be numbers between 0 and 1' },
        { status: 400 }
      )
    }

    // Check player is in this game
    const gamePlayers = [
      ...video.game.teamAPlayers,
      ...video.game.teamBPlayers,
    ]
    if (!gamePlayers.find((p) => p.id === playerId)) {
      return NextResponse.json(
        { error: 'Player is not in this game' },
        { status: 400 }
      )
    }

    // Check if player is already tagged
    if (video.playerTags.find((t) => t.playerId === playerId)) {
      return NextResponse.json(
        { error: 'Player is already tagged in this video' },
        { status: 409 }
      )
    }

    // Check max 4 players
    if (video.playerTags.length >= 4) {
      return NextResponse.json(
        { error: 'Maximum of 4 players can be tagged' },
        { status: 400 }
      )
    }

    // Assign next available color
    const usedColors = video.playerTags.map((t) => t.color)
    const availableColor =
      PLAYER_COLORS.find((c) => !usedColors.includes(c)) || PLAYER_COLORS[0]

    const playerTag = await prisma.videoPlayerTag.create({
      data: {
        videoId: video.id,
        playerId,
        initialX,
        initialY,
        color: availableColor,
      },
      include: { player: true },
    })

    return NextResponse.json(playerTag, { status: 201 })
  } catch (error) {
    console.error('Error creating player tag:', error)
    return NextResponse.json(
      { error: 'Failed to create player tag' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/games/[id]/video/players
 * Remove a player tag from the video
 *
 * Query params:
 * - playerId: string
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params
  const { searchParams } = new URL(request.url)
  const playerId = searchParams.get('playerId')

  if (!playerId) {
    return NextResponse.json(
      { error: 'playerId query parameter is required' },
      { status: 400 }
    )
  }

  try {
    const video = await prisma.gameVideo.findUnique({
      where: { gameId },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // Find and delete the player tag
    const deleted = await prisma.videoPlayerTag.deleteMany({
      where: {
        videoId: video.id,
        playerId,
      },
    })

    if (deleted.count === 0) {
      return NextResponse.json(
        { error: 'Player tag not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting player tag:', error)
    return NextResponse.json(
      { error: 'Failed to delete player tag' },
      { status: 500 }
    )
  }
}
