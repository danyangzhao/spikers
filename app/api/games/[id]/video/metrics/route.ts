import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateGameMetrics } from '@/lib/videoMetrics'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/games/[id]/video/metrics
 * Compute and return all video metrics for a game
 *
 * Query params:
 * - fieldWidth: number (optional, field width in feet, default 20)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: gameId } = await params
  const { searchParams } = new URL(request.url)
  const fieldWidth = parseFloat(searchParams.get('fieldWidth') || '20')

  try {
    // Get the game with video and players
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        teamAPlayers: { select: { id: true, name: true, emoji: true } },
        teamBPlayers: { select: { id: true, name: true, emoji: true } },
        video: {
          include: {
            annotations: true,
          },
        },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (!game.video) {
      return NextResponse.json({ error: 'No video for this game' }, { status: 404 })
    }

    // Get all player IDs
    const allPlayers = [...game.teamAPlayers, ...game.teamBPlayers]
    const playerIds = allPlayers.map((p) => p.id)

    // Calculate metrics
    const metrics = calculateGameMetrics(
      game.video.annotations,
      playerIds,
      fieldWidth
    )

    // Add player info to lateral distance results
    const lateralDistanceWithNames = Object.entries(metrics.lateralDistance).map(
      ([playerId, data]) => {
        const player = allPlayers.find((p) => p.id === playerId)
        return {
          playerId,
          playerName: player?.name || 'Unknown',
          playerEmoji: player?.emoji || '👤',
          ...data,
        }
      }
    )

    // Add player info to spike accuracy results
    const spikeAccuracyByPlayerWithNames = Object.entries(
      metrics.spikeAccuracy.byPlayer
    ).map(([playerId, data]) => {
      const player = allPlayers.find((p) => p.id === playerId)
      return {
        playerId,
        playerName: player?.name || 'Unknown',
        playerEmoji: player?.emoji || '👤',
        ...data,
      }
    })

    return NextResponse.json({
      gameId,
      videoId: game.video.id,
      annotationCount: game.video.annotations.length,
      lateralDistance: lateralDistanceWithNames,
      passCount: metrics.passCount,
      spikeAccuracy: {
        overall: metrics.spikeAccuracy.overall,
        byPlayer: spikeAccuracyByPlayerWithNames,
      },
      pointOutcomes: metrics.pointOutcomes,
    })
  } catch (error) {
    console.error('Error computing metrics:', error)
    return NextResponse.json(
      { error: 'Failed to compute metrics' },
      { status: 500 }
    )
  }
}
