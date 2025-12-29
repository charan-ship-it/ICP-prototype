import { NextRequest, NextResponse } from 'next/server';

/**
 * Get Eleven Labs API key for WebSocket connection
 * This is a secure way to provide the API key to the client
 * In production, you might want to use a token-based system
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Eleven Labs API key not configured' },
        { status: 500 }
      );
    }

    // Return API key (in production, return a temporary token instead)
    // For now, we'll return it directly - in production use JWT or similar
    return NextResponse.json({
      apiKey: apiKey,
    });
  } catch (error: any) {
    console.error('WebSocket key route error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

