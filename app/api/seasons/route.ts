import { NextRequest, NextResponse } from 'next/server'
import { getGroupId } from '@/lib/group'
import { listSeasons, startNewSeason } from '@/lib/seasons'

// GET /api/seasons - List seasons in the current group
export async function GET(request: NextRequest) {
  try {
    const groupId = getGroupId(request)
    if (groupId instanceof NextResponse) return groupId

    const seasons = await listSeasons(groupId)
    return NextResponse.json(seasons)
  } catch (error) {
    console.error('Error listing seasons:', error)
    return NextResponse.json(
      { error: 'Failed to fetch seasons', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST /api/seasons - Start a new season
export async function POST(request: NextRequest) {
  try {
    const groupId = getGroupId(request)
    if (groupId instanceof NextResponse) return groupId

    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name : undefined
    const carryOverPlayerIds = Array.isArray(body.carryOverPlayerIds) ? body.carryOverPlayerIds : []

    if (!carryOverPlayerIds.length) {
      return NextResponse.json(
        { error: 'carryOverPlayerIds is required' },
        { status: 400 }
      )
    }

    const newSeason = await startNewSeason({
      groupId,
      name,
      carryOverPlayerIds,
    })

    return NextResponse.json(newSeason, { status: 201 })
  } catch (error) {
    console.error('Error starting new season:', error)
    return NextResponse.json(
      { error: 'Failed to start season', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
