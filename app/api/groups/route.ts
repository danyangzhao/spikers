import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/groups - Create a new group
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

    if (normalizedName.length < 2 || normalizedName.length > 30) {
      return NextResponse.json(
        { error: 'Group name must be between 2 and 30 characters' },
        { status: 400 }
      )
    }

    const existing = await prisma.group.findUnique({
      where: { name: normalizedName },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'That group name is already taken. Try another!' },
        { status: 409 }
      )
    }

    const group = await prisma.group.create({
      data: { name: normalizedName },
    })

    return NextResponse.json(group, { status: 201 })
  } catch (error) {
    console.error('Error creating group:', error)
    return NextResponse.json(
      { error: 'Failed to create group', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
