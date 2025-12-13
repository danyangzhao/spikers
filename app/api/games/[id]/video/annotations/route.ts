import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/games/[id]/video/annotations
 * List all annotations for a video
 *
 * Query params:
 * - type: filter by annotation type
 * - playerId: filter by player
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const playerId = searchParams.get('playerId')

  try {
    const video = await prisma.gameVideo.findUnique({
      where: { gameId },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const annotations = await prisma.videoAnnotation.findMany({
      where: {
        videoId: video.id,
        ...(type && { type: type as 'PLAYER_POSITION' | 'PASS' | 'SPIKE' | 'POINT_WON' | 'POINT_LOST' }),
        ...(playerId && { playerId }),
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            emoji: true,
          },
        },
      },
      orderBy: { frameTime: 'asc' },
    })

    return NextResponse.json(annotations)
  } catch (error) {
    console.error('Error fetching annotations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch annotations' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/games/[id]/video/annotations
 * Add a single annotation
 *
 * Request body:
 * - frameTime: number (timestamp in seconds)
 * - type: AnnotationType
 * - playerId?: string
 * - x?: number (0-1)
 * - y?: number (0-1)
 * - successful?: boolean (for SPIKE)
 * - reason?: PointReason (for POINT_WON/POINT_LOST)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params

  try {
    const video = await prisma.gameVideo.findUnique({
      where: { gameId },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const body = await request.json()
    const { frameTime, type, playerId, x, y, successful, reason } = body

    // Validate required fields
    if (typeof frameTime !== 'number' || frameTime < 0) {
      return NextResponse.json(
        { error: 'frameTime must be a non-negative number' },
        { status: 400 }
      )
    }

    if (!type) {
      return NextResponse.json(
        { error: 'type is required' },
        { status: 400 }
      )
    }

    // Validate type
    const validTypes = ['PLAYER_POSITION', 'PASS', 'SPIKE', 'POINT_WON', 'POINT_LOST']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate position coordinates if provided
    if (x !== undefined && (typeof x !== 'number' || x < 0 || x > 1)) {
      return NextResponse.json(
        { error: 'x must be a number between 0 and 1' },
        { status: 400 }
      )
    }
    if (y !== undefined && (typeof y !== 'number' || y < 0 || y > 1)) {
      return NextResponse.json(
        { error: 'y must be a number between 0 and 1' },
        { status: 400 }
      )
    }

    // Validate reason if provided
    const validReasons = [
      'SERVE_ACE',
      'GREAT_SPIKE',
      'OPPONENT_ERROR',
      'FAILED_RETURN',
      'NET_VIOLATION',
      'OUT_OF_BOUNDS',
      'OTHER',
    ]
    if (reason !== undefined && !validReasons.includes(reason)) {
      return NextResponse.json(
        { error: `reason must be one of: ${validReasons.join(', ')}` },
        { status: 400 }
      )
    }

    const annotation = await prisma.videoAnnotation.create({
      data: {
        videoId: video.id,
        frameTime,
        type,
        playerId: playerId || null,
        x: x ?? null,
        y: y ?? null,
        successful: successful ?? null,
        reason: reason ?? null,
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            emoji: true,
          },
        },
      },
    })

    return NextResponse.json(annotation, { status: 201 })
  } catch (error) {
    console.error('Error creating annotation:', error)
    return NextResponse.json(
      { error: 'Failed to create annotation' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/games/[id]/video/annotations
 * Delete an annotation by ID
 *
 * Query params:
 * - annotationId: string (required)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params
  const { searchParams } = new URL(request.url)
  const annotationId = searchParams.get('annotationId')

  if (!annotationId) {
    return NextResponse.json(
      { error: 'annotationId query parameter is required' },
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

    // Verify the annotation belongs to this video
    const annotation = await prisma.videoAnnotation.findFirst({
      where: {
        id: annotationId,
        videoId: video.id,
      },
    })

    if (!annotation) {
      return NextResponse.json(
        { error: 'Annotation not found' },
        { status: 404 }
      )
    }

    await prisma.videoAnnotation.delete({
      where: { id: annotationId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting annotation:', error)
    return NextResponse.json(
      { error: 'Failed to delete annotation' },
      { status: 500 }
    )
  }
}
