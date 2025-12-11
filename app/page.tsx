'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Session {
  id: string
  date: string
  location: string | null
  status: 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED'
  _count?: {
    games: number
    attendances: number
  }
}

interface RSVPSummary {
  going: number
  maybe: number
  out: number
}

interface Player {
  id: string
  name: string
  emoji: string
  rating: number
}

export default function HomePage() {
  const [upcomingSession, setUpcomingSession] = useState<Session | null>(null)
  const [liveSession, setLiveSession] = useState<Session | null>(null)
  const [recentSessions, setRecentSessions] = useState<Session[]>([])
  const [rsvpSummary, setRsvpSummary] = useState<RSVPSummary | null>(null)
  const [topPlayers, setTopPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const hasFetched = useRef(false)

  useEffect(() => {
    // Prevent re-fetching if data was already loaded
    if (hasFetched.current) return
    hasFetched.current = true

    async function fetchData() {
      try {
        // Fetch sessions
        const sessionsRes = await fetch('/api/sessions?limit=5')
        if (sessionsRes.ok) {
          const sessions: Session[] = await sessionsRes.json()

          // Find upcoming and live sessions
          const upcoming = sessions.find((s) => s.status === 'UPCOMING')
          const live = sessions.find((s) => s.status === 'IN_PROGRESS')
          const completed = sessions.filter((s) => s.status === 'COMPLETED').slice(0, 3)

          setUpcomingSession(upcoming || null)
          setLiveSession(live || null)
          setRecentSessions(completed)

          // Fetch RSVP for upcoming session
          if (upcoming) {
            const rsvpRes = await fetch(`/api/sessions/${upcoming.id}/rsvp`)
            if (rsvpRes.ok) {
              const rsvpData = await rsvpRes.json()
              setRsvpSummary(rsvpData.summary)
            }
          }
        }

        // Fetch top players by rating
        const playersRes = await fetch('/api/players')
        if (playersRes.ok) {
          const players: Player[] = await playersRes.json()
          setTopPlayers(players.sort((a, b) => b.rating - a.rating).slice(0, 5))
        }
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header - Always visible immediately */}
      <div className="text-center py-4">
        <h1 className="text-3xl font-bold mb-1">
          <span className="text-4xl">🏐</span> Spikers
        </h1>
        <p className="text-[var(--foreground-muted)]">
          Track your Spikeball glory
        </p>
      </div>

      {/* Loading skeleton for session section */}
      {loading ? (
        <div className="card p-6 animate-pulse">
          <div className="h-6 bg-[var(--background-elevated)] rounded w-1/3 mb-4"></div>
          <div className="h-12 bg-[var(--background-elevated)] rounded mb-4"></div>
          <div className="h-10 bg-[var(--background-elevated)] rounded"></div>
        </div>
      ) : (
        <>
          {/* Live Session Alert */}
          {liveSession && (
            <Link
              href={`/sessions/${liveSession.id}`}
              className="block card p-4 bg-gradient-to-r from-[var(--accent-primary)]/20 to-orange-500/20 border-2 border-[var(--accent-primary)]/50 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">🔴</span>
                <div className="flex-1">
                  <div className="font-bold text-[var(--accent-primary)]">LIVE SESSION</div>
                  <div className="text-sm">
                    {liveSession.location || 'Tap to view'}
                  </div>
                </div>
                <span className="text-2xl">→</span>
              </div>
            </Link>
          )}

          {/* Upcoming Session */}
          {upcomingSession && !liveSession && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Next Session</h2>
                <Link
                  href={`/sessions/${upcomingSession.id}`}
                  className="text-[var(--accent-primary)] text-sm font-medium"
                >
                  View →
                </Link>
              </div>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="text-4xl">📅</div>
                <div>
                  <div className="font-bold text-lg">{formatDate(upcomingSession.date)}</div>
                  {upcomingSession.location && (
                    <div className="text-sm text-[var(--foreground-muted)]">
                      📍 {upcomingSession.location}
                    </div>
                  )}
                </div>
              </div>

              {rsvpSummary && (
                <div className="flex gap-3 text-sm">
                  <div className="flex-1 card-elevated p-3 text-center">
                    <div className="text-2xl font-bold text-[var(--accent-success)]">
                      {rsvpSummary.going}
                    </div>
                    <div className="text-[var(--foreground-muted)]">Going</div>
                  </div>
                  <div className="flex-1 card-elevated p-3 text-center">
                    <div className="text-2xl font-bold text-[var(--accent-primary)]">
                      {rsvpSummary.maybe}
                    </div>
                    <div className="text-[var(--foreground-muted)]">Maybe</div>
                  </div>
                  <div className="flex-1 card-elevated p-3 text-center">
                    <div className="text-2xl font-bold text-[var(--accent-danger)]">
                      {rsvpSummary.out}
                    </div>
                    <div className="text-[var(--foreground-muted)]">Out</div>
                  </div>
                </div>
              )}

              <Link
                href={`/sessions/${upcomingSession.id}`}
                className="btn btn-primary w-full mt-4"
              >
                RSVP Now
              </Link>
            </div>
          )}

          {/* No Session - Create One */}
          {!upcomingSession && !liveSession && (
            <div className="card p-6 text-center">
              <div className="text-4xl mb-3">📅</div>
              <h2 className="font-semibold mb-2">No upcoming sessions</h2>
              <p className="text-sm text-[var(--foreground-muted)] mb-4">
                Schedule your next Spikeball session!
              </p>
              <Link href="/sessions" className="btn btn-primary">
                + Create Session
              </Link>
            </div>
          )}
        </>
      )}

      {/* Leaderboard */}
      {loading ? (
        <div className="card p-4 animate-pulse">
          <div className="h-6 bg-[var(--background-elevated)] rounded w-1/3 mb-4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-[var(--background-elevated)] rounded"></div>
            ))}
          </div>
        </div>
      ) : topPlayers.length > 0 ? (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">🏆 Leaderboard</h2>
            <Link
              href="/players"
              className="text-[var(--accent-primary)] text-sm font-medium"
            >
              All Players →
            </Link>
          </div>

          <div className="space-y-2">
            {topPlayers.map((player, index) => (
              <Link
                key={player.id}
                href={`/players/${player.id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  index === 0
                    ? 'bg-yellow-500/20 text-yellow-500'
                    : index === 1
                    ? 'bg-gray-400/20 text-gray-400'
                    : index === 2
                    ? 'bg-orange-600/20 text-orange-600'
                    : 'bg-[var(--background-elevated)] text-[var(--foreground-muted)]'
                }`}>
                  {index + 1}
                </div>
                <span className="text-xl">{player.emoji}</span>
                <span className="flex-1 font-medium">{player.name}</span>
                <span className="text-[var(--accent-primary)] font-bold">
                  {player.rating}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Recent Sessions */}
      {!loading && recentSessions.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">📊 Recent Sessions</h2>
            <Link
              href="/sessions"
              className="text-[var(--accent-primary)] text-sm font-medium"
            >
              View All →
            </Link>
          </div>

          <div className="space-y-2">
            {recentSessions.map((session) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="text-xl">✅</span>
                <div className="flex-1">
                  <div className="font-medium">{formatDate(session.date)}</div>
                  <div className="text-xs text-[var(--foreground-muted)]">
                    {session._count?.games || 0} games • {session._count?.attendances || 0} players
                  </div>
                </div>
                <span className="text-[var(--foreground-muted)]">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links - Always visible immediately */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/sessions"
          className="card-elevated p-4 text-center hover:bg-white/5 transition-colors"
        >
          <div className="text-3xl mb-2">📅</div>
          <div className="font-medium">Sessions</div>
        </Link>
        <Link
          href="/players"
          className="card-elevated p-4 text-center hover:bg-white/5 transition-colors"
        >
          <div className="text-3xl mb-2">👥</div>
          <div className="font-medium">Players</div>
        </Link>
      </div>
    </div>
  )
}
