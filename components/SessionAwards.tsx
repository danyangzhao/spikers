interface PlayerInfo {
  id: string
  name: string
  emoji: string
}

interface SessionAwardsProps {
  playerOfTheDay?: (PlayerInfo & { wins: number }) | null
  ironman?: (PlayerInfo & { gamesPlayed: number }) | null
  socialButterfly?: (PlayerInfo & { uniqueTeammates: number }) | null
  clutchPlayer?: (PlayerInfo & { closeGameWins: number }) | null
  theWall?: (PlayerInfo & { avgPointsAgainst: number }) | null
  hotStreak?: (PlayerInfo & { streak: number }) | null
  totalGames: number
}

export default function SessionAwards({
  playerOfTheDay,
  ironman,
  socialButterfly,
  clutchPlayer,
  theWall,
  hotStreak,
  totalGames,
}: SessionAwardsProps) {
  if (totalGames === 0) {
    return (
      <div className="text-center text-[var(--foreground-muted)] py-8">
        <p className="text-4xl mb-2">🎮</p>
        <p>No games played yet</p>
        <p className="text-sm">Add games to see awards!</p>
      </div>
    )
  }

  const awards = [
    playerOfTheDay && {
      title: 'Player of the Day',
      emoji: '🏆',
      player: playerOfTheDay,
      stat: `${playerOfTheDay.wins} wins`,
      gradient: 'from-yellow-500/20 to-orange-500/20',
    },
    ironman && {
      title: 'Ironman',
      emoji: '💪',
      player: ironman,
      stat: `${ironman.gamesPlayed} games`,
      gradient: 'from-blue-500/20 to-purple-500/20',
    },
    socialButterfly && {
      title: 'Social Butterfly',
      emoji: '🦋',
      player: socialButterfly,
      stat: `${socialButterfly.uniqueTeammates} teammates`,
      gradient: 'from-pink-500/20 to-rose-500/20',
    },
    clutchPlayer && {
      title: 'Clutch Player',
      emoji: '🎯',
      player: clutchPlayer,
      stat: `${clutchPlayer.closeGameWins} close wins`,
      gradient: 'from-emerald-500/20 to-teal-500/20',
    },
    theWall && {
      title: 'The Wall',
      emoji: '🧱',
      player: theWall,
      stat: `${theWall.avgPointsAgainst} avg pts against`,
      gradient: 'from-slate-500/20 to-gray-500/20',
    },
    hotStreak && {
      title: 'Hot Streak',
      emoji: '🔥',
      player: hotStreak,
      stat: `${hotStreak.streak} wins in a row`,
      gradient: 'from-red-500/20 to-amber-500/20',
    },
  ].filter(Boolean)

  if (awards.length === 0) {
    return (
      <div className="text-center text-[var(--foreground-muted)] py-8">
        <p className="text-4xl mb-2">📊</p>
        <p>Need more games for awards</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {awards.map((award, index) => (
        <div
          key={award!.title}
          className={`card p-4 bg-gradient-to-r ${award!.gradient} animate-fade-in`}
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">{award!.emoji}</span>
            <div className="flex-1">
              <div className="text-xs text-[var(--foreground-muted)] uppercase tracking-wide">
                {award!.title}
              </div>
              <div className="font-semibold flex items-center gap-2">
                <span>{award!.player.emoji}</span>
                <span>{award!.player.name}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-[var(--accent-primary)]">
                {award!.stat}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

