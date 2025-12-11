import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

// PATCH /api/games/[id] - Update a game (scores only for simplicity)
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { scoreA, scoreB } = body

    if (typeof scoreA !== 'number' || typeof scoreB !== 'number') {
      return NextResponse.json(
        { error: 'scoreA and scoreB are required' },
        { status: 400 }
      )
    }

    if (scoreA === scoreB) {
      return NextResponse.json(
        { error: 'Games cannot end in a tie' },
        { status: 400 }
      )
    }

    const game = await prisma.game.update({
      where: { id },
      data: { scoreA, scoreB },
      include: {
        teamAPlayers: true,
        teamBPlayers: true,
      },
    })

    return NextResponse.json(game)
  } catch (error) {
    console.error('Error updating game:', error)
    return NextResponse.json(
      { error: 'Failed to update game' },
      { status: 500 }
    )
  }
}

// DELETE /api/games/[id] - Delete a game
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  try {
    // Get game to find rating history entries
    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        ratingHistory: true,
      },
    })

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      )
    }

    // Revert ratings for all players in this game
    await prisma.$transaction(async (tx) => {
      // Revert each player's rating to before the game
      for (const history of game.ratingHistory) {
        await tx.player.update({
          where: { id: history.playerId },
          data: { rating: history.ratingBefore },
        })
      }

      // Delete the game (rating history will be cascade deleted)
      await tx.game.delete({
        where: { id },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting game:', error)
    return NextResponse.json(
      { error: 'Failed to delete game' },
      { status: 500 }
    )
  }
}

