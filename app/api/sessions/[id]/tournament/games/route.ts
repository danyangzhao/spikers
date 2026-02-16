import { NextRequest, NextResponse } from 'next/server'
import { recordTournamentGame } from '@/lib/tournament'

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/sessions/[id]/tournament/games - Record one game inside a match series
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id: sessionId } = await params
  try {
    const body = await request.json()
    const { tournamentId, matchId, scoreA, scoreB } = body
    if (!tournamentId || !matchId) {
      return NextResponse.json(
        { error: 'tournamentId and matchId are required' },
        { status: 400 }
      )
    }
    const tournament = await recordTournamentGame({
      sessionId,
      tournamentId,
      matchId,
      scoreA,
      scoreB,
    })
    return NextResponse.json(tournament, { status: 201 })
  } catch (error) {
    console.error('Error recording tournament game:', error)
    const message = error instanceof Error ? error.message : 'Failed to record tournament game'
    const statusCode = message.includes('not found') ? 404 : message.includes('required') || message.includes('tie') || message.includes('complete') || message.includes('active') ? 400 : 500
    return NextResponse.json({ error: message }, { status: statusCode })
  }
}
