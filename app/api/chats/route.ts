import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET: List all chats for a session
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 400 }
      );
    }

    // Get chats for this session, ordered by updated_at DESC
    const { data: chats, error } = await supabase
      .from('chats')
      .select('id, title, updated_at')
      .eq('session_id', sessionId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching chats:', error);
      return NextResponse.json(
        { error: 'Failed to fetch chats' },
        { status: 500 }
      );
    }

    // Get last message for each chat to show in sidebar
    const chatsWithLastMessage = await Promise.all(
      (chats || []).map(async (chat) => {
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('content')
          .eq('chat_id', chat.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          id: chat.id,
          title: chat.title,
          lastMessage: lastMessage?.content,
          timestamp: new Date(chat.updated_at),
        };
      })
    );

    return NextResponse.json(chatsWithLastMessage);
  } catch (error) {
    console.error('Unexpected error in chats API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create a new chat
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();
    const { session_id, title } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 400 }
      );
    }

    // Verify session exists
    const { data: session } = await supabase
      .from('sessions')
      .select('session_id')
      .eq('session_id', session_id)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session_id' },
        { status: 404 }
      );
    }

    // Create new chat
    const { data: chat, error } = await supabase
      .from('chats')
      .insert({
        session_id,
        title: title || 'New Chat',
      })
      .select('id, title, created_at, updated_at')
      .single();

    if (error) {
      console.error('Error creating chat:', error);
      return NextResponse.json(
        { error: 'Failed to create chat' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: chat.id,
      title: chat.title,
      timestamp: new Date(chat.updated_at),
    });
  } catch (error) {
    console.error('Unexpected error in chats API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

