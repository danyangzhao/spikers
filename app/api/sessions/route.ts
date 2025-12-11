import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/sessions - List all sessions
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const limit = searchParams.get('limit')

  const sessions = await prisma.session.findMany({
    where: status ? { status: status as 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED' } : undefined,
    orderBy: { date: 'desc' },
    take: limit ? parseInt(limit) : undefined,
    include: {
      _count: {
        select: {
          games: true,
          attendances: { where: { present: true } },
        },
      },
    },
  })

  return NextResponse.json(sessions)
}

// POST /api/sessions - Create a new session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, location } = body

    if (!date) {
      return NextResponse.json(
        { error: 'Date is required' },
        { status: 400 }
      )
    }

    const session = await prisma.session.create({
      data: {
        date: new Date(date),
        location: location || null,
        status: 'UPCOMING',
      },
    })

    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    console.error('Error creating session:', error)
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    )
  }
}

