'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Player {
  id: string
  name: string
  emoji: string
  rating: number
  isActive: boolean
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('🏐')
  const hasFetched = useRef(false)

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true
    fetchPlayers()
  }, [])

  async function fetchPlayers() {
    try {
      const res = await fetch('/api/players')
      if (res.ok) {
        const data = await res.json()
        setPlayers(data)
      }
    } catch (error) {
      console.error('Failed to fetch players:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return

    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), emoji: newEmoji }),
      })

      if (res.ok) {
        const newPlayer = await res.json()
        setPlayers([...players, newPlayer])
        setNewName('')
        setNewEmoji('🏐')
        setShowAddForm(false)
      }
    } catch (error) {
      console.error('Failed to add player:', error)
    }
  }

  const emojiOptions = ['🏐', '🔥', '⚡', '🌟', '💪', '🎯', '🦅', '🐍', '🦁', '🐺', '🎸', '🚀']

  return (
    <div>
      {/* Header - Always visible */}
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Players</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn btn-primary"
        >
          {showAddForm ? 'Cancel' : '+ Add'}
        </button>
      </header>

      {showAddForm && (
        <form onSubmit={handleAddPlayer} className="card p-4 mb-6 animate-slide-up">
          <h2 className="font-semibold mb-4">Add New Player</h2>
          
          <div className="mb-4">
            <label className="block text-sm text-[var(--foreground-muted)] mb-2">
              Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter player name"
              className="input"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm text-[var(--foreground-muted)] mb-2">
              Emoji
            </label>
            <div className="flex flex-wrap gap-2">
              {emojiOptions.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setNewEmoji(emoji)}
                  className={`w-10 h-10 rounded-lg text-xl transition-all ${
                    newEmoji === emoji
                      ? 'bg-[var(--accent-primary)] scale-110'
                      : 'bg-[var(--background-elevated)] hover:scale-105'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn btn-primary w-full">
            Add Player
          </button>
        </form>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-4 flex items-center gap-4 animate-pulse">
              <div className="w-12 h-12 bg-[var(--background-elevated)] rounded-full"></div>
              <div className="flex-1">
                <div className="h-5 bg-[var(--background-elevated)] rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-[var(--background-elevated)] rounded w-1/4"></div>
              </div>
            </div>
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="text-center text-[var(--foreground-muted)] py-12">
          <p className="text-4xl mb-4">👥</p>
          <p className="mb-2">No players yet</p>
          <p className="text-sm">Add your first player to get started!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {players.map((player, index) => (
            <Link
              key={player.id}
              href={`/players/${player.id}`}
              className="card p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="text-3xl">{player.emoji}</div>
              <div className="flex-1">
                <div className="font-semibold">{player.name}</div>
                <div className="text-sm text-[var(--foreground-muted)]">
                  Rating: {player.rating}
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
