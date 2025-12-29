import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy endpoint to get WebSocket URL with API key
 * This is needed because WebSocket connections can't include headers
 * We'll return a signed URL or token that the client can use
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

    const { searchParams } = new URL(request.url);
    const voiceId = searchParams.get('voiceId') || 'JBFqnCBsd6RMkjVDRZzb';
    const modelId = searchParams.get('modelId') || 'eleven_multilingual_v2';

    // Return WebSocket URL with API key
    // Note: In production, you might want to use a token-based approach
    // For now, we'll return the URL and the client will need to handle auth
    return NextResponse.json({
      wsUrl: `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=${modelId}`,
      // In a real implementation, you'd generate a temporary token here
      // For now, the client will need to send API key in the initial message
    });
  } catch (error: any) {
    console.error('WebSocket route error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

