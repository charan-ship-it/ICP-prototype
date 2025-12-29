import { NextRequest, NextResponse } from 'next/server';

// POST: Transcribe audio using Eleven Labs Speech-to-Text
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'audio file is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Eleven Labs API key not configured' },
        { status: 500 }
      );
    }

    // Convert File to Blob
    const audioBlob = new Blob([audioFile], { type: audioFile.type });

    // Call Eleven Labs Speech-to-Text API using direct fetch
    // The STT endpoint format may vary - adjust based on actual API documentation
    const formDataForElevenLabs = new FormData();
    formDataForElevenLabs.append('audio', audioBlob, audioFile.name || 'audio.webm');

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: formDataForElevenLabs,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'Unknown error' };
      }
      console.error('Eleven Labs STT API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to transcribe audio', details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      text: data.text || data.transcription || '',
    });
  } catch (error: any) {
    console.error('ElevenLabs STT error:', error);
    return NextResponse.json(
      { error: 'Failed to transcribe audio with ElevenLabs', details: error.message },
      { status: 500 }
    );
  }
}

