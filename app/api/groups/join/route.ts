import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/groups/join - Join a group by name
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Group name is required' },
        { status: 400 }
      )
    }

    const normalizedName = name.trim().toUpperCase()

    const group = await prisma.group.findUnique({
      where: { name: normalizedName },
    })

    if (!group) {
      return NextResponse.json(
        { error: 'No group found with that name. Check the spelling and try again.' },
        { status: 404 }
      )
    }

    return NextResponse.json(group)
  } catch (error) {
    console.error('Error joining group:', error)
    return NextResponse.json(
      { error: 'Failed to join group', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
