import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface BatchAnnotation {
  frameTime: number
  type: string
  playerId?: string
  x?: number
  y?: number
  successful?: boolean
  reason?: string
}

/**
 * POST /api/games/[id]/video/annotations/batch
 * Add multiple annotations at once (for MediaPipe position data)
 *
 * Request body:
 * - annotations: BatchAnnotation[]
 *
 * This is optimized for bulk inserts of player position data
 * from MediaPipe tracking.
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
    const { annotations } = body

    if (!Array.isArray(annotations)) {
      return NextResponse.json(
        { error: 'annotations must be an array' },
        { status: 400 }
      )
    }

    if (annotations.length === 0) {
      return NextResponse.json(
        { error: 'annotations array cannot be empty' },
        { status: 400 }
      )
    }

    // Limit batch size to prevent timeouts
    if (annotations.length > 1000) {
      return NextResponse.json(
        { error: 'Maximum 1000 annotations per batch' },
        { status: 400 }
      )
    }

    // Validate all annotations
    const validTypes = ['PLAYER_POSITION', 'PASS', 'SPIKE', 'POINT_WON', 'POINT_LOST']
    const validReasons = [
      'SERVE_ACE',
      'GREAT_SPIKE',
      'OPPONENT_ERROR',
      'FAILED_RETURN',
      'NET_VIOLATION',
      'OUT_OF_BOUNDS',
      'OTHER',
    ]

    for (let i = 0; i < annotations.length; i++) {
      const ann = annotations[i] as BatchAnnotation
      
      if (typeof ann.frameTime !== 'number' || ann.frameTime < 0) {
        return NextResponse.json(
          { error: `Annotation ${i}: frameTime must be a non-negative number` },
          { status: 400 }
        )
      }

      if (!ann.type || !validTypes.includes(ann.type)) {
        return NextResponse.json(
          { error: `Annotation ${i}: type must be one of: ${validTypes.join(', ')}` },
          { status: 400 }
        )
      }

      if (ann.x !== undefined && (typeof ann.x !== 'number' || ann.x < 0 || ann.x > 1)) {
        return NextResponse.json(
          { error: `Annotation ${i}: x must be between 0 and 1` },
          { status: 400 }
        )
      }

      if (ann.y !== undefined && (typeof ann.y !== 'number' || ann.y < 0 || ann.y > 1)) {
        return NextResponse.json(
          { error: `Annotation ${i}: y must be between 0 and 1` },
          { status: 400 }
        )
      }

      if (ann.reason !== undefined && !validReasons.includes(ann.reason)) {
        return NextResponse.json(
          { error: `Annotation ${i}: reason must be one of: ${validReasons.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Prepare data for bulk insert
    const data = annotations.map((ann: BatchAnnotation) => ({
      videoId: video.id,
      frameTime: ann.frameTime,
      type: ann.type as 'PLAYER_POSITION' | 'PASS' | 'SPIKE' | 'POINT_WON' | 'POINT_LOST',
      playerId: ann.playerId || null,
      x: ann.x ?? null,
      y: ann.y ?? null,
      successful: ann.successful ?? null,
      reason: ann.reason as 'SERVE_ACE' | 'GREAT_SPIKE' | 'OPPONENT_ERROR' | 'FAILED_RETURN' | 'NET_VIOLATION' | 'OUT_OF_BOUNDS' | 'OTHER' | null ?? null,
    }))

    // Use createMany for efficient bulk insert
    const result = await prisma.videoAnnotation.createMany({
      data,
    })

    return NextResponse.json(
      {
        success: true,
        count: result.count,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating batch annotations:', error)
    return NextResponse.json(
      { error: 'Failed to create annotations' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/games/[id]/video/annotations/batch
 * Delete multiple annotations (e.g., all PLAYER_POSITION for re-tracking)
 *
 * Query params:
 * - type: AnnotationType (optional, delete all of this type)
 * - playerId: string (optional, delete all for this player)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const playerId = searchParams.get('playerId')

  if (!type && !playerId) {
    return NextResponse.json(
      { error: 'At least one of type or playerId query parameter is required' },
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

    const result = await prisma.videoAnnotation.deleteMany({
      where: {
        videoId: video.id,
        ...(type && { type: type as 'PLAYER_POSITION' | 'PASS' | 'SPIKE' | 'POINT_WON' | 'POINT_LOST' }),
        ...(playerId && { playerId }),
      },
    })

    return NextResponse.json({
      success: true,
      deleted: result.count,
    })
  } catch (error) {
    console.error('Error deleting batch annotations:', error)
    return NextResponse.json(
      { error: 'Failed to delete annotations' },
      { status: 500 }
    )
  }
}
