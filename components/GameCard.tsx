import PlayerChip from './PlayerChip'

interface Player {
  id: string
  name: string
  emoji: string
}

interface GameCardProps {
  id: string
  teamA: Player[]
  teamB: Player[]
  scoreA: number
  scoreB: number
  gameNumber?: number
  onDelete?: () => void
}

export default function GameCard({
  teamA,
  teamB,
  scoreA,
  scoreB,
  gameNumber,
  onDelete,
}: GameCardProps) {
  const teamAWon = scoreA > scoreB
  const teamBWon = scoreB > scoreA

  return (
    <div className="card p-4 animate-fade-in">
      {gameNumber && (
        <div className="text-xs text-[var(--foreground-muted)] mb-3 flex items-center justify-between">
          <span>Game {gameNumber}</span>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-[var(--accent-danger)] hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      )}
      
      <div className="flex items-center justify-between gap-4">
        {/* Team A */}
        <div className={`flex-1 ${teamAWon ? '' : 'opacity-60'}`}>
          <div className="flex flex-wrap gap-1 mb-2">
            {teamA.map((player) => (
              <PlayerChip
                key={player.id}
                id={player.id}
                name={player.name}
                emoji={player.emoji}
                size="sm"
              />
            ))}
          </div>
        </div>

        {/* Score */}
        <div className="flex items-center gap-3 px-4">
          <span
            className={`text-2xl font-bold ${
              teamAWon ? 'text-[var(--accent-success)]' : 'text-[var(--foreground-muted)]'
            }`}
          >
            {scoreA}
          </span>
          <span className="text-[var(--foreground-muted)]">-</span>
          <span
            className={`text-2xl font-bold ${
              teamBWon ? 'text-[var(--accent-success)]' : 'text-[var(--foreground-muted)]'
            }`}
          >
            {scoreB}
          </span>
        </div>

        {/* Team B */}
        <div className={`flex-1 ${teamBWon ? '' : 'opacity-60'}`}>
          <div className="flex flex-wrap gap-1 mb-2 justify-end">
            {teamB.map((player) => (
              <PlayerChip
                key={player.id}
                id={player.id}
                name={player.name}
                emoji={player.emoji}
                size="sm"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

