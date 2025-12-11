'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import BadgeGrid from '@/components/BadgeGrid'

interface PlayerStats {
  player: {
    id: string
    name: string
    emoji: string
    rating: number
    isActive: boolean
  }
  lifetimeStats: {
    gamesPlayed: number
    wins: number
    losses: number
    winRate: number
    pointsFor: number
    pointsAgainst: number
    avgPointDiff: number
    sessionsAttended: number
  }
  attendanceStreak: number
  partnerChemistry: Array<{
    partnerId: string
    partnerName: string
    partnerEmoji: string
    gamesPlayed: number
    wins: number
    winRate: number
  }>
  nemesisOpponents: Array<{
    opponentIds: string[]
    opponentNames: string[]
    opponentEmojis: string[]
    gamesPlayed: number
    wins: number
    winRate: number
  }>
  badges: Array<{
    id: string
    code: string
    name: string
    description: string
    iconEmoji: string
    earnedAt: string
  }>
}

interface Badge {
  id: string
  code: string
  name: string
  description: string
  iconEmoji: string
}

export default function PlayerProfilePage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = use(params)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [allBadges, setAllBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'stats' | 'chemistry' | 'badges'>('stats')

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, badgesRes] = await Promise.all([
          fetch(`/api/players/${id}/stats`),
          fetch('/api/badges'),
        ])

        if (statsRes.ok) {
          setStats(await statsRes.json())
        }
        if (badgesRes.ok) {
          setAllBadges(await badgesRes.json())
        }
      } catch (error) {
        console.error('Failed to fetch player stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-4xl animate-pulse">🏐</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">😕</p>
        <p>Player not found</p>
        <Link href="/players" className="btn btn-secondary mt-4">
          Back to Players
        </Link>
      </div>
    )
  }

  const { player, lifetimeStats, attendanceStreak, partnerChemistry, nemesisOpponents, badges } = stats

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/players" className="btn btn-ghost p-2">
          ←
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span className="text-3xl">{player.emoji}</span>
          {player.name}
        </h1>
      </div>

      {/* Rating Card */}
      <div className="card p-6 mb-6 text-center bg-gradient-to-br from-yellow-500/10 to-orange-500/10">
        <div className="text-sm text-[var(--foreground-muted)] mb-1">Rating</div>
        <div className="text-4xl font-bold text-[var(--accent-primary)]">
          {player.rating}
        </div>
        {attendanceStreak > 0 && (
          <div className="mt-2 text-sm">
            🔥 {attendanceStreak} session streak
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {(['stats', 'chemistry', 'badges'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`btn ${
              activeTab === tab ? 'btn-primary' : 'btn-secondary'
            } whitespace-nowrap`}
          >
            {tab === 'stats' && '📊 Stats'}
            {tab === 'chemistry' && '🤝 Chemistry'}
            {tab === 'badges' && '🏅 Badges'}
          </button>
        ))}
      </div>

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Games Played"
              value={lifetimeStats.gamesPlayed}
              icon="🎮"
            />
            <StatCard
              label="Win Rate"
              value={`${(lifetimeStats.winRate * 100).toFixed(0)}%`}
              icon="📈"
            />
            <StatCard
              label="Wins"
              value={lifetimeStats.wins}
              icon="✅"
            />
            <StatCard
              label="Losses"
              value={lifetimeStats.losses}
              icon="❌"
            />
            <StatCard
              label="Sessions"
              value={lifetimeStats.sessionsAttended}
              icon="📅"
            />
            <StatCard
              label="Avg Point Diff"
              value={lifetimeStats.avgPointDiff.toFixed(1)}
              icon={lifetimeStats.avgPointDiff >= 0 ? '⬆️' : '⬇️'}
            />
          </div>
        </div>
      )}

      {/* Chemistry Tab */}
      {activeTab === 'chemistry' && (
        <div className="space-y-6 animate-fade-in">
          {/* Best Partners */}
          <div>
            <h3 className="text-sm text-[var(--foreground-muted)] uppercase tracking-wide mb-3">
              🤝 Best Partners
            </h3>
            {partnerChemistry.length > 0 ? (
              <div className="space-y-2">
                {partnerChemistry.map((partner, index) => (
                  <div
                    key={partner.partnerId}
                    className="card-elevated p-3 flex items-center gap-3"
                  >
                    <span className="text-lg font-bold text-[var(--foreground-muted)]">
                      #{index + 1}
                    </span>
                    <span className="text-xl">{partner.partnerEmoji}</span>
                    <div className="flex-1">
                      <div className="font-medium">{partner.partnerName}</div>
                      <div className="text-xs text-[var(--foreground-muted)]">
                        {partner.gamesPlayed} games together
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[var(--accent-success)] font-semibold">
                        {(partner.winRate * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-[var(--foreground-muted)]">
                        win rate
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[var(--foreground-muted)] text-sm">
                Play more games to see partner stats!
              </p>
            )}
          </div>

          {/* Nemesis */}
          <div>
            <h3 className="text-sm text-[var(--foreground-muted)] uppercase tracking-wide mb-3">
              😈 Toughest Opponents
            </h3>
            {nemesisOpponents.length > 0 ? (
              <div className="space-y-2">
                {nemesisOpponents.map((nemesis, index) => (
                  <div
                    key={nemesis.opponentIds.join('-')}
                    className="card-elevated p-3 flex items-center gap-3"
                  >
                    <span className="text-lg font-bold text-[var(--foreground-muted)]">
                      #{index + 1}
                    </span>
                    <div className="flex gap-1">
                      {nemesis.opponentEmojis.map((emoji, i) => (
                        <span key={i} className="text-xl">{emoji}</span>
                      ))}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {nemesis.opponentNames.join(' & ')}
                      </div>
                      <div className="text-xs text-[var(--foreground-muted)]">
                        {nemesis.gamesPlayed} games against
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[var(--accent-danger)] font-semibold">
                        {(nemesis.winRate * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-[var(--foreground-muted)]">
                        your win rate
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[var(--foreground-muted)] text-sm">
                Play more games to see nemesis stats!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Badges Tab */}
      {activeTab === 'badges' && (
        <div className="animate-fade-in">
          <BadgeGrid
            earnedBadges={badges}
            allBadges={allBadges}
            showLocked
          />
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string | number
  icon: string
}) {
  return (
    <div className="card-elevated p-4 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-[var(--foreground-muted)]">{label}</div>
    </div>
  )
}

