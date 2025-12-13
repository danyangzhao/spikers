import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  calculateLateralDistance,
  calculatePassCount,
  calculateSpikeAccuracy,
  calculatePointOutcomes,
} from '@/lib/videoMetrics'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/sessions/[id]/video-summary
 * Get aggregated video stats for all games in a session
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: sessionId } = await params

  try {
    // Get session with all games and their videos
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        games: {
          include: {
            teamAPlayers: { select: { id: true, name: true, emoji: true } },
            teamBPlayers: { select: { id: true, name: true, emoji: true } },
            video: {
              include: {
                annotations: true,
              },
            },
          },
        },
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Filter to games with annotated videos
    const gamesWithVideo = session.games.filter(
      (g) => g.video && ['SETUP_COMPLETE', 'ANNOTATED'].includes(g.video.status)
    )

    if (gamesWithVideo.length === 0) {
      return NextResponse.json({
        sessionId,
        gamesWithVideo: 0,
        totalGames: session.games.length,
        hasVideoData: false,
      })
    }

    // Get all unique players
    const playerMap = new Map<string, { id: string; name: string; emoji: string }>()
    for (const game of gamesWithVideo) {
      for (const p of [...game.teamAPlayers, ...game.teamBPlayers]) {
        playerMap.set(p.id, p)
      }
    }
    const players = Array.from(playerMap.values())

    // Aggregate all annotations
    const allAnnotations = gamesWithVideo.flatMap((g) => g.video?.annotations || [])

    // Calculate per-player stats
    const playerStats = players.map((player) => {
      const lateralDistance = calculateLateralDistance(allAnnotations, player.id)
      const spikeAccuracy = calculateSpikeAccuracy(allAnnotations, player.id)

      return {
        player,
        lateralDistance,
        spikeAccuracy,
      }
    })

    // Sort by distance (most active players first)
    playerStats.sort((a, b) => b.lateralDistance.distanceFeet - a.lateralDistance.distanceFeet)

    // Overall stats
    const passCount = calculatePassCount(allAnnotations)
    const pointOutcomes = calculatePointOutcomes(allAnnotations)

    // Find MVP (most distance + best spike accuracy)
    const mvp = playerStats.length > 0 ? playerStats[0] : null

    return NextResponse.json({
      sessionId,
      gamesWithVideo: gamesWithVideo.length,
      totalGames: session.games.length,
      hasVideoData: true,
      totalAnnotations: allAnnotations.length,
      playerStats,
      passCount,
      pointOutcomes,
      mvp: mvp ? {
        player: mvp.player,
        distanceMiles: mvp.lateralDistance.distanceMiles,
        spikeAccuracy: mvp.spikeAccuracy.percentage,
      } : null,
    })
  } catch (error) {
    console.error('Error fetching session video summary:', error)
    return NextResponse.json(
      { error: 'Failed to fetch video summary' },
      { status: 500 }
    )
  }
}
