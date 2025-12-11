import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/badges - List all badges
export async function GET() {
  const badges = await prisma.badge.findMany({
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(badges)
}

