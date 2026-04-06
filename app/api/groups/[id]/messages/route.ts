import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPushToGroup } from '@/lib/apns'

const COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24 hours

// GET /api/groups/[id]/messages - List group messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params

    const messages = await prisma.groupMessage.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, emoji: true } },
      },
    })

    // Include cooldown info so the client knows when the next push can be sent
    const lastPush = await prisma.groupMessage.findFirst({
      where: { groupId, pushSentAt: { not: null } },
      orderBy: { pushSentAt: 'desc' },
      select: { pushSentAt: true },
    })

    const nextPushAvailableAt = lastPush?.pushSentAt
      ? new Date(lastPush.pushSentAt.getTime() + COOLDOWN_MS)
      : null

    const canPush = !nextPushAvailableAt || nextPushAvailableAt <= new Date()

    return NextResponse.json({
      messages,
      cooldown: {
        canPush,
        nextPushAvailableAt: nextPushAvailableAt?.toISOString() ?? null,
      },
    })
  } catch (error) {
    console.error('Error fetching group messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST /api/groups/[id]/messages - Create a group message (with 24h push cooldown)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params
    const body = await request.json()
    const { title, messageBody, authorId } = body

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (!messageBody || typeof messageBody !== 'string') {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }
    if (!authorId || typeof authorId !== 'string') {
      return NextResponse.json({ error: 'Author ID is required' }, { status: 400 })
    }

    // Verify the author belongs to this group
    const author = await prisma.player.findFirst({
      where: { id: authorId, groupId },
    })
    if (!author) {
      return NextResponse.json({ error: 'Player not found in this group' }, { status: 404 })
    }

    // Check cooldown: find the most recent push for this group
    const lastPushedMessage = await prisma.groupMessage.findFirst({
      where: { groupId, pushSentAt: { not: null } },
      orderBy: { pushSentAt: 'desc' },
      select: { pushSentAt: true },
    })

    const now = new Date()
    const cooldownExpired = !lastPushedMessage?.pushSentAt ||
      now.getTime() - lastPushedMessage.pushSentAt.getTime() >= COOLDOWN_MS

    const message = await prisma.groupMessage.create({
      data: {
        title,
        body: messageBody,
        groupId,
        authorId,
        pushSentAt: cooldownExpired ? now : null,
      },
      include: {
        author: { select: { id: true, name: true, emoji: true } },
      },
    })

    let pushSent = false
    if (cooldownExpired) {
      sendPushToGroup(
        groupId,
        title,
        messageBody,
        { groupMessageId: message.id }
      ).catch((err) => {
        console.error('Failed to send group push notification:', err)
      })
      pushSent = true
    }

    const nextPushAvailableAt = cooldownExpired
      ? new Date(now.getTime() + COOLDOWN_MS)
      : new Date((lastPushedMessage?.pushSentAt?.getTime() ?? 0) + COOLDOWN_MS)

    return NextResponse.json(
      {
        message,
        pushSent,
        cooldown: {
          canPush: false,
          nextPushAvailableAt: nextPushAvailableAt.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating group message:', error)
    return NextResponse.json(
      { error: 'Failed to create message', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
