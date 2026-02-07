import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/notifications/unregister - Remove a device token
// Call this when a user logs out or disables notifications
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Device token is required' },
        { status: 400 }
      )
    }

    // Try to delete the token from the database
    // If it doesn't exist, that's fine — we just ignore it
    await prisma.deviceToken
      .delete({ where: { token } })
      .catch(() => {
        // Token wasn't found — that's okay
      })

    return NextResponse.json(
      { status: 'unregistered' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error unregistering device token:', error)
    return NextResponse.json(
      {
        error: 'Failed to unregister device token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
