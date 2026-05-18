import { NextRequest, NextResponse } from 'next/server'
import { getGroupId } from '@/lib/group'
import { getSeasonById } from '@/lib/seasons'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/seasons/[id] - Get season details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const groupId = getGroupId(request)
    if (groupId instanceof NextResponse) return groupId

    const { id } = await params
    const season = await getSeasonById(groupId, id)

    if (!season) {
      return NextResponse.json(
        { error: 'Season not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(season)
  } catch (error) {
    console.error('Error fetching season:', error)
    return NextResponse.json(
      { error: 'Failed to fetch season', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
