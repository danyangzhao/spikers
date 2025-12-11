'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/sessions', label: 'Sessions', icon: '📅' },
  { href: '/players', label: 'Players', icon: '👥' },
]

export default function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 glass border-t border-white/5 safe-area-bottom">
      <div className="max-w-lg mx-auto flex justify-around items-center py-2">
        {navItems.map((item) => {
          const isActive = 
            item.href === '/' 
              ? pathname === '/' 
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-all ${
                isActive 
                  ? 'text-[var(--accent-primary)]' 
                  : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

