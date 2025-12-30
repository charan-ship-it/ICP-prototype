import { NextRequest, NextResponse } from 'next/server';

// POST: Transcribe audio using OpenAI Whisper
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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Convert File to Blob and prepare FormData for OpenAI
    const audioBytes = await audioFile.arrayBuffer();
    const audioBlob = new Blob([audioBytes], { type: audioFile.type || 'audio/webm' });

    const openaiFormData = new FormData();
    openaiFormData.append('file', audioBlob, audioFile.name || 'audio.webm');
    openaiFormData.append('model', 'whisper-1');
    openaiFormData.append('language', 'en'); // Optional: specify language for better accuracy

    console.log('[Whisper STT] Transcribing audio:', {
      size: audioBlob.size,
      type: audioBlob.type,
    });

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: openaiFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'Unknown error' };
      }
      console.error('OpenAI Whisper API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to transcribe audio', details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Whisper STT] Transcription result:', data.text?.slice(0, 50) + '...');
    
    return NextResponse.json({
      text: data.text || '',
    });
  } catch (error: any) {
    console.error('Whisper STT error:', error);
    return NextResponse.json(
      { error: 'Failed to transcribe audio with Whisper', details: error.message },
      { status: 500 }
    );
  }
}

