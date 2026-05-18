import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGroupId } from '@/lib/group'
import { getActiveSeason } from '@/lib/seasons'
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
  const groupId = getGroupId(request)
  if (groupId instanceof NextResponse) return groupId
  const { searchParams } = new URL(request.url)
  const requestedSeasonId = searchParams.get('seasonId')

  const player = await prisma.player.findFirst({
    where: {
      id,
      groupId,
    },
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

  const seasons = await prisma.season.findMany({
    where: { groupId },
    orderBy: { number: 'desc' },
  })
  const activeSeason = seasons.find((season) => season.isActive) ?? await getActiveSeason(groupId)
  const resolvedSeason = requestedSeasonId
    ? seasons.find((season) => season.id === requestedSeasonId) ?? activeSeason
    : activeSeason

  if (!resolvedSeason) {
    return NextResponse.json(
      { error: 'No season configured for this group' },
      { status: 400 }
    )
  }

  if (resolvedSeason.isActive) {
    // Award any badges the player has earned but hasn't received yet.
    // This catches badges missed during session completion (e.g. race conditions).
    await awardNewBadges(id, resolvedSeason.id)
  }

  const playerWithScopedBadges = await prisma.player.findUnique({
    where: { id },
    include: {
      playerBadges: {
        where: { seasonId: resolvedSeason.id },
        include: { badge: true },
      },
    },
  })

  // Get all stats and badge data
  const [lifetimeStats, partnerChemistry, nemesisOpponents, attendanceStreak, allBadges, badgeProgress, totalPlayers, badgeEarnCounts] =
    await Promise.all([
      getPlayerLifetimeStats(id, resolvedSeason.id),
      getPartnerChemistry(id, 3, resolvedSeason.id),
      getNemesisOpponents(id, 3, resolvedSeason.id),
      getAttendanceStreak(id, resolvedSeason.id),
      prisma.badge.findMany({ orderBy: { name: 'asc' } }),
      getBadgeProgress(id, resolvedSeason.id),
      prisma.player.count({ where: { groupId, isActive: true } }),
      prisma.playerBadge.groupBy({
        by: ['badgeId'],
        where: { seasonId: resolvedSeason.id },
        _count: true,
      }),
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
    badges: (playerWithScopedBadges?.playerBadges ?? []).map((pb) => ({
      id: pb.badge.id,
      code: pb.badge.code,
      name: pb.badge.name,
      description: pb.badge.description,
      iconEmoji: pb.badge.iconEmoji,
      earnedAt: pb.earnedAt,
    })),
    allBadges: allBadgesWithPercent,
    badgeProgress,
    seasons: seasons.map((season) => ({
      id: season.id,
      name: season.name,
      number: season.number,
      isActive: season.isActive,
    })),
    selectedSeasonId: resolvedSeason.id,
  })
}

