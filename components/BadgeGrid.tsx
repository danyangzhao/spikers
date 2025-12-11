interface Badge {
  id: string
  code: string
  name: string
  description: string
  iconEmoji: string
  earnedAt?: string
}

interface BadgeGridProps {
  earnedBadges: Badge[]
  allBadges?: Badge[]
  showLocked?: boolean
}

export default function BadgeGrid({
  earnedBadges,
  allBadges = [],
  showLocked = false,
}: BadgeGridProps) {
  const earnedCodes = new Set(earnedBadges.map((b) => b.code))
  
  const lockedBadges = showLocked
    ? allBadges.filter((b) => !earnedCodes.has(b.code))
    : []

  if (earnedBadges.length === 0 && lockedBadges.length === 0) {
    return (
      <div className="text-center text-[var(--foreground-muted)] py-8">
        <p className="text-4xl mb-2">🏅</p>
        <p>No badges earned yet</p>
        <p className="text-sm">Keep playing to unlock achievements!</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {earnedBadges.map((badge) => (
        <div
          key={badge.id}
          className="card-elevated p-3 text-center animate-fade-in"
          title={badge.description}
        >
          <div className="text-3xl mb-1">{badge.iconEmoji}</div>
          <div className="text-xs font-medium truncate">{badge.name}</div>
        </div>
      ))}
      
      {lockedBadges.map((badge) => (
        <div
          key={badge.id}
          className="card-elevated p-3 text-center opacity-40"
          title={badge.description}
        >
          <div className="text-3xl mb-1 grayscale">🔒</div>
          <div className="text-xs font-medium truncate text-[var(--foreground-muted)]">
            {badge.name}
          </div>
        </div>
      ))}
    </div>
  )
}

