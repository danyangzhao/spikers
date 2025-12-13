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
 * GET /api/players/[id]/video-stats
 * Get aggregated video stats for a player across all their games
 *
 * Query params:
 * - sessionId: filter to specific session (optional)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: playerId } = await params
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')

  try {
    // Get player info
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true, emoji: true },
    })

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    // Get all games this player was in, with videos and annotations
    const games = await prisma.game.findMany({
      where: {
        OR: [
          { teamAPlayers: { some: { id: playerId } } },
          { teamBPlayers: { some: { id: playerId } } },
        ],
        ...(sessionId && { sessionId }),
        video: {
          status: { in: ['SETUP_COMPLETE', 'ANNOTATED'] },
        },
      },
      include: {
        video: {
          include: {
            annotations: true,
          },
        },
        session: {
          select: { id: true, date: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (games.length === 0) {
      return NextResponse.json({
        player,
        gamesAnalyzed: 0,
        totalAnnotations: 0,
        lateralDistance: { distanceFeet: 0, distanceMiles: 0 },
        passCount: { avgPassesPerRally: 0, totalPasses: 0, totalRallies: 0 },
        spikeAccuracy: { successful: 0, total: 0, percentage: 0 },
        pointOutcomes: { totalWon: 0, totalLost: 0, total: 0, winPercentage: 0 },
      })
    }

    // Aggregate annotations from all games
    const allAnnotations = games.flatMap((g) => g.video?.annotations || [])

    // Calculate aggregated metrics
    const lateralDistance = calculateLateralDistance(allAnnotations, playerId)
    const passCount = calculatePassCount(allAnnotations)
    const spikeAccuracy = calculateSpikeAccuracy(allAnnotations, playerId)
    const pointOutcomes = calculatePointOutcomes(allAnnotations)

    // Per-game breakdown
    const gameBreakdown = games.map((game) => {
      const gameAnnotations = game.video?.annotations || []
      return {
        gameId: game.id,
        sessionId: game.session.id,
        sessionDate: game.session.date,
        annotationCount: gameAnnotations.length,
        lateralDistance: calculateLateralDistance(gameAnnotations, playerId),
        spikeAccuracy: calculateSpikeAccuracy(gameAnnotations, playerId),
      }
    })

    return NextResponse.json({
      player,
      gamesAnalyzed: games.length,
      totalAnnotations: allAnnotations.length,
      lateralDistance,
      passCount,
      spikeAccuracy,
      pointOutcomes,
      gameBreakdown,
    })
  } catch (error) {
    console.error('Error fetching player video stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch video stats' },
      { status: 500 }
    )
  }
}
