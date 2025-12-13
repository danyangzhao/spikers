import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/games/[id]/video/trim
 * Set the start and end times for video trimming
 *
 * Note: This doesn't actually re-encode the video. It just stores
 * the trim points so the frontend can skip to the right position.
 *
 * Request body:
 * - startTime: number (seconds from start)
 * - endTime: number (seconds from start)
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
    const { startTime, endTime } = body

    // Validate inputs
    if (typeof startTime !== 'number' || typeof endTime !== 'number') {
      return NextResponse.json(
        { error: 'startTime and endTime must be numbers' },
        { status: 400 }
      )
    }

    if (startTime < 0) {
      return NextResponse.json(
        { error: 'startTime cannot be negative' },
        { status: 400 }
      )
    }

    if (endTime <= startTime) {
      return NextResponse.json(
        { error: 'endTime must be greater than startTime' },
        { status: 400 }
      )
    }

    // Check against video duration if known
    if (video.duration && endTime > video.duration) {
      return NextResponse.json(
        { error: 'endTime cannot exceed video duration' },
        { status: 400 }
      )
    }

    const updatedVideo = await prisma.gameVideo.update({
      where: { gameId },
      data: {
        startTime,
        endTime,
      },
    })

    return NextResponse.json(updatedVideo)
  } catch (error) {
    console.error('Error updating video trim:', error)
    return NextResponse.json(
      { error: 'Failed to update video trim' },
      { status: 500 }
    )
  }
}
