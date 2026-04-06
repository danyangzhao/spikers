import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT /api/groups/[id]/messages/[messageId] - Edit a group message (no new push)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { id: groupId, messageId } = await params
    const body = await request.json()
    const { title, messageBody } = body

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (!messageBody || typeof messageBody !== 'string') {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }

    const existing = await prisma.groupMessage.findFirst({
      where: { id: messageId, groupId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const updated = await prisma.groupMessage.update({
      where: { id: messageId },
      data: { title, body: messageBody },
      include: {
        author: { select: { id: true, name: true, emoji: true } },
      },
    })

    return NextResponse.json({ message: updated, pushSent: false })
  } catch (error) {
    console.error('Error updating group message:', error)
    return NextResponse.json(
      { error: 'Failed to update message', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
