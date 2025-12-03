import { NextRequest, NextResponse } from 'next/server';
import { getRedisStatus, initializeRedis } from '@/analytics-engine/services/redis-cache';

/**
 * GET /api/analytics/redis-status - Check Redis connection status
 */
export async function GET(request: NextRequest) {
  try {
    // Try to initialize Redis if not already connected
    await initializeRedis();
    
    const status = getRedisStatus();
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    return NextResponse.json({
      redis: {
        available: status.available,
        connected: status.connected,
        url: redisUrl,
        status: status.available ? 'connected' : 'disconnected',
      },
      message: status.available 
        ? 'Redis is connected and ready'
        : 'Redis is not available (using in-memory cache fallback)',
    });
  } catch (error) {
    return NextResponse.json(
      {
        redis: {
          available: false,
          connected: false,
          status: 'error',
        },
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to check Redis status',
      },
      { status: 500 }
    );
  }
}

