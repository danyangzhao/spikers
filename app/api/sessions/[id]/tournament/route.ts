import { NextRequest, NextResponse } from 'next/server'
import { TournamentTeamMode } from '@prisma/client'
import { endTournamentEarly, getSessionTournament, setupTournament } from '@/lib/tournament'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/sessions/[id]/tournament - Get tournament state for session
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params
  try {
    const tournament = await getSessionTournament(id)
    return NextResponse.json(tournament)
  } catch (error) {
    console.error('Error fetching tournament:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tournament' },
      { status: 500 }
    )
  }
}

// POST /api/sessions/[id]/tournament - Set up tournament
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params
  try {
    const body = await request.json()
    const modeRaw = String(body.mode ?? 'RANDOM').toUpperCase()
    const mode = modeRaw === 'FAIR' ? TournamentTeamMode.FAIR : TournamentTeamMode.RANDOM
    const tournament = await setupTournament(id, mode)
    return NextResponse.json(tournament, { status: 201 })
  } catch (error) {
    console.error('Error creating tournament:', error)
    const message = error instanceof Error ? error.message : 'Failed to create tournament'
    const statusCode = message.includes('not found') ? 404 : message.includes('Need at least') || message.includes('already active') ? 400 : 500
    return NextResponse.json({ error: message }, { status: statusCode })
  }
}

// PATCH /api/sessions/[id]/tournament - End tournament early
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params
  try {
    const body = await request.json()
    if (body.action !== 'END') {
      return NextResponse.json(
        { error: 'Unsupported action' },
        { status: 400 }
      )
    }

    const tournament = await endTournamentEarly(id)
    return NextResponse.json(tournament)
  } catch (error) {
    console.error('Error ending tournament:', error)
    const message = error instanceof Error ? error.message : 'Failed to end tournament'
    const statusCode = message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status: statusCode })
  }
}
