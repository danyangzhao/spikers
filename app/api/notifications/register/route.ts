import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/notifications/register - Register a device token for push notifications
// The iOS app calls this after it gets a device token from Apple (APNs)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, platform } = body

    // Make sure we got a token
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Device token is required' },
        { status: 400 }
      )
    }

    // Save the token to the database
    // "upsert" means: update if it already exists, create if it doesn't
    // This prevents duplicate tokens if the app registers multiple times
    const deviceToken = await prisma.deviceToken.upsert({
      where: { token },
      update: {
        platform: platform || 'ios',
        updatedAt: new Date(),
      },
      create: {
        token,
        platform: platform || 'ios',
      },
    })

    return NextResponse.json(
      { status: 'registered', id: deviceToken.id },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error registering device token:', error)
    return NextResponse.json(
      {
        error: 'Failed to register device token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
