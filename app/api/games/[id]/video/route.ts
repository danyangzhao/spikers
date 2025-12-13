import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  generateVideoKey,
  getUploadUrl,
  getPlaybackUrl,
  deleteVideo,
  isS3Configured,
} from '@/lib/s3'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/games/[id]/video
 * Get a pre-signed URL for uploading a video
 *
 * Request body:
 * - filename: string (original filename, used to determine extension)
 * - contentType: string (e.g., "video/mp4")
 *
 * Response:
 * - uploadUrl: string (pre-signed S3 URL for direct upload)
 * - video: GameVideo object (created with UPLOADING status)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params

  try {
    // Check if S3 is configured
    if (!isS3Configured()) {
      return NextResponse.json(
        { error: 'Video upload is not configured. Please set AWS credentials.' },
        { status: 503 }
      )
    }

    // Verify game exists
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { video: true },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Check if video already exists
    if (game.video) {
      return NextResponse.json(
        { error: 'Video already exists for this game. Delete it first to upload a new one.' },
        { status: 409 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { filename, contentType } = body

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'filename and contentType are required' },
        { status: 400 }
      )
    }

    // Generate S3 key and get pre-signed upload URL
    const s3Key = generateVideoKey(gameId, filename)
    const { uploadUrl, bucket } = await getUploadUrl(s3Key, contentType)

    // Create video record with UPLOADING status
    const video = await prisma.gameVideo.create({
      data: {
        gameId,
        s3Key,
        s3Bucket: bucket,
        status: 'UPLOADING',
      },
    })

    return NextResponse.json({
      uploadUrl,
      video,
    })
  } catch (error) {
    console.error('Error creating video upload URL:', error)
    return NextResponse.json(
      { error: 'Failed to create upload URL' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/games/[id]/video
 * Get video details and playback URL
 *
 * Response:
 * - video: GameVideo object with playbackUrl
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
        _count: {
          select: { annotations: true },
        },
      },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // Generate fresh playback URL
    const playbackUrl = await getPlaybackUrl(video.s3Key)

    return NextResponse.json({
      ...video,
      playbackUrl,
    })
  } catch (error) {
    console.error('Error fetching video:', error)
    return NextResponse.json(
      { error: 'Failed to fetch video' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/games/[id]/video
 * Update video status (called after upload completes) or other fields
 *
 * Request body (all optional):
 * - status: VideoStatus
 * - duration: number
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
    const { status, duration } = body

    const updatedVideo = await prisma.gameVideo.update({
      where: { gameId },
      data: {
        ...(status && { status }),
        ...(duration !== undefined && { duration }),
      },
    })

    return NextResponse.json(updatedVideo)
  } catch (error) {
    console.error('Error updating video:', error)
    return NextResponse.json(
      { error: 'Failed to update video' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/games/[id]/video
 * Delete video from S3 and database
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params

  try {
    const video = await prisma.gameVideo.findUnique({
      where: { gameId },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // Delete from S3
    try {
      await deleteVideo(video.s3Key)
    } catch (s3Error) {
      console.error('Error deleting from S3:', s3Error)
      // Continue with database deletion even if S3 fails
    }

    // Delete from database (cascades to annotations and player tags)
    await prisma.gameVideo.delete({
      where: { gameId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting video:', error)
    return NextResponse.json(
      { error: 'Failed to delete video' },
      { status: 500 }
    )
  }
}
