import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/health - Health check endpoint
export async function GET() {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'unknown',
    databaseUrl: process.env.DATABASE_URL ? 'set' : 'not set',
  }

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`
    checks.database = 'connected'
    
    // Check if tables exist
    try {
      await prisma.player.count()
      checks.database = 'connected (tables exist)'
    } catch {
      checks.database = 'connected (tables missing - run migrations)'
      checks.status = 'degraded'
    }
  } catch (error) {
    checks.database = `error: ${error instanceof Error ? error.message : 'unknown'}`
    checks.status = 'error'
  }

  return NextResponse.json(checks, {
    status: checks.status === 'ok' ? 200 : 503,
  })
}

