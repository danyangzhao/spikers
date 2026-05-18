import { NextRequest, NextResponse } from 'next/server'
import { getGroupId } from '@/lib/group'
import { listSeasons, startNewSeason } from '@/lib/seasons'

function mapSeasonStartError(error: unknown): { status: number; message: string } {
  const detail = error instanceof Error ? error.message : 'Unknown error'
  const lowered = detail.toLowerCase()

  if (detail === 'A future season is already announced for this group') {
    return { status: 409, message: detail }
  }
  if (
    lowered.includes('column') && lowered.includes('scheduledstartat') ||
    lowered.includes('unknown argument `scheduledstartat`')
  ) {
    return {
      status: 500,
      message: 'Scheduled seasons are not available on the server yet. Please deploy the latest backend migrations.',
    }
  }

  return { status: 500, message: 'Failed to start season' }
}

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
    const scheduledStartAtRaw = typeof body.scheduledStartAt === 'string' ? body.scheduledStartAt : undefined

    if (!carryOverPlayerIds.length) {
      return NextResponse.json(
        { error: 'carryOverPlayerIds is required' },
        { status: 400 }
      )
    }

    let scheduledStartAt: Date | undefined
    if (scheduledStartAtRaw) {
      const parsed = new Date(scheduledStartAtRaw)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'scheduledStartAt must be a valid ISO date string' },
          { status: 400 }
        )
      }
      scheduledStartAt = parsed
    }

    const newSeason = await startNewSeason({
      groupId,
      name,
      carryOverPlayerIds,
      scheduledStartAt,
    })

    return NextResponse.json(newSeason, { status: 201 })
  } catch (error) {
    console.error('Error starting new season:', error)
    const mapped = mapSeasonStartError(error)
    return NextResponse.json(
      { error: mapped.message, details: error instanceof Error ? error.message : 'Unknown error' },
      { status: mapped.status }
    )
  }
}
