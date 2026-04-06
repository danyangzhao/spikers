import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPushToGroup } from '@/lib/apns'
import { getGroupId } from '@/lib/group'

// GET /api/sessions - List all sessions
export async function GET(request: NextRequest) {
  try {
    const groupId = getGroupId(request)
    if (groupId instanceof NextResponse) return groupId

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = searchParams.get('limit')

    const sessions = await prisma.session.findMany({
      where: {
        groupId,
        ...(status ? { status: status as 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED' } : {}),
      },
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
  } catch (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sessions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST /api/sessions - Create a new session
export async function POST(request: NextRequest) {
  try {
    const groupId = getGroupId(request)
    if (groupId instanceof NextResponse) return groupId

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
        groupId,
      },
    })

    const sessionDate = new Date(date)
    const dateStr = sessionDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    const locationStr = location ? ` at ${location}` : ''

    sendPushToGroup(
      groupId,
      'New Session! 🏐',
      `A session has been scheduled for ${dateStr}${locationStr}. RSVP now!`,
      { sessionId: session.id }
    ).catch((err) => {
      console.error('Failed to send push notifications:', err)
    })

    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    console.error('Error creating session:', error)
    return NextResponse.json(
      { error: 'Failed to create session', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
