import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/games/[id]/video/setup
 * Save the net position for the video
 * Called during the setup phase before annotation begins
 *
 * Request body:
 * - netX1, netY1: number (first corner of net, normalized 0-1)
 * - netX2, netY2: number (second corner of net, normalized 0-1)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params

  try {
    const video = await prisma.gameVideo.findUnique({
      where: { gameId },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const body = await request.json()
    const { netX1, netY1, netX2, netY2 } = body

    // Validate inputs - all must be numbers between 0 and 1
    const coords = [netX1, netY1, netX2, netY2]
    for (const coord of coords) {
      if (typeof coord !== 'number' || coord < 0 || coord > 1) {
        return NextResponse.json(
          { error: 'Net coordinates must be numbers between 0 and 1' },
          { status: 400 }
        )
      }
    }

    const updatedVideo = await prisma.gameVideo.update({
      where: { gameId },
      data: {
        netX1,
        netY1,
        netX2,
        netY2,
      },
    })

    return NextResponse.json(updatedVideo)
  } catch (error) {
    console.error('Error updating video setup:', error)
    return NextResponse.json(
      { error: 'Failed to update video setup' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/games/[id]/video/setup
 * Mark video setup as complete (players tagged and net drawn)
 * This updates the video status to SETUP_COMPLETE
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params

  try {
    const video = await prisma.gameVideo.findUnique({
      where: { gameId },
      include: {
        playerTags: true,
      },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // Validate that net is marked
    if (
      video.netX1 === null ||
      video.netY1 === null ||
      video.netX2 === null ||
      video.netY2 === null
    ) {
      return NextResponse.json(
        { error: 'Net position must be marked before completing setup' },
        { status: 400 }
      )
    }

    // Validate that at least 2 players are tagged (minimum for a game)
    if (video.playerTags.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 players must be tagged before completing setup' },
        { status: 400 }
      )
    }

    const updatedVideo = await prisma.gameVideo.update({
      where: { gameId },
      data: {
        status: 'SETUP_COMPLETE',
      },
    })

    return NextResponse.json(updatedVideo)
  } catch (error) {
    console.error('Error completing video setup:', error)
    return NextResponse.json(
      { error: 'Failed to complete video setup' },
      { status: 500 }
    )
  }
}
