import Link from 'next/link'

interface PlayerChipProps {
  id: string
  name: string
  emoji: string
  rating?: number
  showRating?: boolean
  size?: 'sm' | 'md' | 'lg'
  clickable?: boolean
}

export default function PlayerChip({
  id,
  name,
  emoji,
  rating,
  showRating = false,
  size = 'md',
  clickable = true,
}: PlayerChipProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-1 gap-1',
    md: 'text-sm px-3 py-1.5 gap-1.5',
    lg: 'text-base px-4 py-2 gap-2',
  }

  const emojiSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
  }

  const content = (
    <div
      className={`inline-flex items-center card-elevated ${sizeClasses[size]} ${
        clickable ? 'hover:bg-white/10 cursor-pointer transition-colors' : ''
      }`}
    >
      <span className={emojiSizes[size]}>{emoji}</span>
      <span className="font-medium">{name}</span>
      {showRating && rating !== undefined && (
        <span className="text-[var(--foreground-muted)] ml-1">
          {rating}
        </span>
      )}
    </div>
  )

  if (clickable) {
    return <Link href={`/players/${id}`}>{content}</Link>
  }

  return content
}

