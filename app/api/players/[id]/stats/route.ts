import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getPlayerLifetimeStats,
  getPartnerChemistry,
  getNemesisOpponents,
  getAttendanceStreak,
  getBadgeProgress,
  awardNewBadges,
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

  // Award any badges the player has earned but hasn't received yet.
  // This catches badges missed during session completion (e.g. race conditions).
  await awardNewBadges(id)

  // Verify player exists (fetched after awarding so new badges are included)
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

  // Get all stats and badge data
  const [lifetimeStats, partnerChemistry, nemesisOpponents, attendanceStreak, allBadges, badgeProgress, totalPlayers, badgeEarnCounts] =
    await Promise.all([
      getPlayerLifetimeStats(id),
      getPartnerChemistry(id),
      getNemesisOpponents(id),
      getAttendanceStreak(id),
      prisma.badge.findMany({ orderBy: { name: 'asc' } }),
      getBadgeProgress(id),
      prisma.player.count({ where: { isActive: true } }),
      prisma.playerBadge.groupBy({ by: ['badgeId'], _count: true }),
    ])

  // Build a lookup of badgeId -> number of players who earned it
  const earnCountMap = new Map(badgeEarnCounts.map((b) => [b.badgeId, b._count]))

  // Enrich each badge with the percentage of players who earned it
  const allBadgesWithPercent = allBadges.map((badge) => ({
    ...badge,
    earnedByPercent: totalPlayers > 0
      ? Math.round(((earnCountMap.get(badge.id) ?? 0) / totalPlayers) * 100)
      : 0,
  }))

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
    allBadges: allBadgesWithPercent,
    badgeProgress,
  })
}

