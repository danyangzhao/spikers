'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Session {
  id: string
  date: string
  location: string | null
  status: 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED'
  _count: {
    games: number
    attendances: number
  }
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const hasFetched = useRef(false)

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true
    fetchSessions()
  }, [])

  async function fetchSessions() {
    try {
      const res = await fetch('/api/sessions')
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddSession(e: React.FormEvent) {
    e.preventDefault()
    if (!newDate) return

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date(newDate).toISOString(),
          location: newLocation || null,
        }),
      })

      if (res.ok) {
        // Re-fetch to get the session with _count included
        await fetchSessions()
        setNewDate('')
        setNewLocation('')
        setShowAddForm(false)
      }
    } catch (error) {
      console.error('Failed to add session:', error)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  const getStatusBadge = (status: Session['status']) => {
    switch (status) {
      case 'UPCOMING':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--accent-info)]/20 text-[var(--accent-info)]">
            Upcoming
          </span>
        )
      case 'IN_PROGRESS':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]">
            Live
          </span>
        )
      case 'COMPLETED':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--accent-success)]/20 text-[var(--accent-success)]">
            Completed
          </span>
        )
    }
  }

  return (
    <div>
      {/* Header - Always visible */}
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sessions</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn btn-primary"
        >
          {showAddForm ? 'Cancel' : '+ New'}
        </button>
      </header>

      {showAddForm && (
        <form onSubmit={handleAddSession} className="card p-4 mb-6 animate-slide-up">
          <h2 className="font-semibold mb-4">Schedule New Session</h2>
          
          <div className="mb-4">
            <label className="block text-sm text-[var(--foreground-muted)] mb-2">
              Date & Time
            </label>
            <input
              type="datetime-local"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="input"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm text-[var(--foreground-muted)] mb-2">
              Location (optional)
            </label>
            <input
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="e.g., Central Park"
              className="input"
            />
          </div>

          <button type="submit" className="btn btn-primary w-full">
            Create Session
          </button>
        </form>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 flex items-center gap-4 animate-pulse">
              <div className="w-12 h-12 bg-[var(--background-elevated)] rounded-full"></div>
              <div className="flex-1">
                <div className="h-5 bg-[var(--background-elevated)] rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-[var(--background-elevated)] rounded w-2/3"></div>
              </div>
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center text-[var(--foreground-muted)] py-12">
          <p className="text-4xl mb-4">📅</p>
          <p className="mb-2">No sessions yet</p>
          <p className="text-sm">Schedule your first Spikeball session!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session, index) => (
            <Link
              key={session.id}
              href={`/sessions/${session.id}`}
              className="card p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="text-3xl">
                {session.status === 'COMPLETED' ? '✅' : session.status === 'IN_PROGRESS' ? '🏐' : '📅'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">{formatDate(session.date)}</span>
                  {getStatusBadge(session.status)}
                </div>
                <div className="text-sm text-[var(--foreground-muted)]">
                  {session.location || 'No location set'}
                  {session._count.games > 0 && (
                    <span className="ml-2">• {session._count.games} games</span>
                  )}
                  {session._count.attendances > 0 && (
                    <span className="ml-2">• {session._count.attendances} players</span>
                  )}
                </div>
              </div>
              <div className="text-[var(--foreground-muted)]">→</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
