import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { randomUUID } from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('session_id');

    // If session_id provided, check if it exists
    if (sessionId) {
      const { data, error } = await supabase
        .from('sessions')
        .select('session_id, created_at')
        .eq('session_id', sessionId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" error, which is fine
        console.error('Error fetching session:', error);
        return NextResponse.json(
          { error: 'Failed to fetch session' },
          { status: 500 }
        );
      }

      if (data) {
        return NextResponse.json({
          session_id: data.session_id,
          created_at: data.created_at,
        });
      }
    }

    // Create new session
    const newSessionId = randomUUID();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        session_id: newSessionId,
        created_at: now,
        updated_at: now,
      })
      .select('session_id, created_at')
      .single();

    if (error) {
      console.error('Error creating session:', error);
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      session_id: data.session_id,
      created_at: data.created_at,
    });
  } catch (error) {
    console.error('Unexpected error in sessions API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

