import { NextRequest, NextResponse } from 'next/server'

/**
 * Extracts the group ID from the X-Group-Id request header.
 * Returns the groupId string, or a NextResponse error if missing.
 */
export function getGroupId(request: NextRequest): string | NextResponse {
  const groupId = request.headers.get('X-Group-Id')

  if (!groupId) {
    return NextResponse.json(
      { error: 'Missing X-Group-Id header' },
      { status: 400 }
    )
  }

  return groupId
}
