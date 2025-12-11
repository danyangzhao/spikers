import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getPlayerLifetimeStats,
  getPartnerChemistry,
  getNemesisOpponents,
  getAttendanceStreak,
} from '@/lib/stats'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/players/[id]/stats - Get computed stats for a player
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  // Verify player exists
  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      playerBadges: {
        include: { badge: true },
      },
    },
  })

  if (!player) {
    return NextResponse.json(
      { error: 'Player not found' },
      { status: 404 }
    )
  }

  // Get all stats
  const [lifetimeStats, partnerChemistry, nemesisOpponents, attendanceStreak] =
    await Promise.all([
      getPlayerLifetimeStats(id),
      getPartnerChemistry(id),
      getNemesisOpponents(id),
      getAttendanceStreak(id),
    ])

  return NextResponse.json({
    player: {
      id: player.id,
      name: player.name,
      emoji: player.emoji,
      rating: player.rating,
      isActive: player.isActive,
    },
    lifetimeStats,
    attendanceStreak,
    partnerChemistry,
    nemesisOpponents,
    badges: player.playerBadges.map((pb) => ({
      id: pb.badge.id,
      code: pb.badge.code,
      name: pb.badge.name,
      description: pb.badge.description,
      iconEmoji: pb.badge.iconEmoji,
      earnedAt: pb.earnedAt,
    })),
  })
}

