import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET: Get all messages for a chat
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const supabase = createServerClient();
    const { chatId } = await params;

    if (!chatId) {
      return NextResponse.json(
        { error: 'chat_id is required' },
        { status: 400 }
      );
    }

    // Verify chat exists
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .single();

    if (chatError || !chat) {
      console.error('Chat not found:', chatError);
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

    // Get all messages for this chat, ordered by created_at ASC
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, role, content, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    // Convert to display format (return timestamps as ISO strings)
    const formattedMessages = (messages || []).map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.created_at, // Return as ISO string, will be converted to Date on client
    }));

    return NextResponse.json(formattedMessages);
  } catch (error) {
    console.error('Unexpected error in messages API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create a new message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const supabase = createServerClient();
    const { chatId } = await params;
    const body = await request.json();
    const { role, content } = body;

    if (!role || !content) {
      return NextResponse.json(
        { error: 'role and content are required' },
        { status: 400 }
      );
    }

    if (role !== 'user' && role !== 'assistant') {
      return NextResponse.json(
        { error: 'role must be "user" or "assistant"' },
        { status: 400 }
      );
    }

    // Validate content length (PostgreSQL TEXT can be very large, but we'll limit to 1MB for practical reasons)
    const maxContentLength = 1024 * 1024; // 1MB
    if (typeof content === 'string' && content.length > maxContentLength) {
      return NextResponse.json(
        { 
          error: 'Message content too long',
          details: `Content exceeds maximum length of ${maxContentLength} characters`,
        },
        { status: 400 }
      );
    }

    // Verify chat exists
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .single();

    if (chatError || !chat) {
      console.error('Chat not found:', chatError);
      return NextResponse.json(
        { 
          error: 'Chat not found',
          details: chatError?.message || 'Chat does not exist',
        },
        { status: 404 }
      );
    }

    // Create message
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        role,
        content,
      })
      .select('id, role, content, created_at')
      .single();

    if (error) {
      console.error('Error creating message:', error);
      return NextResponse.json(
        { 
          error: 'Failed to create message',
          details: error.message || error,
          code: error.code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.created_at, // Return as ISO string, will be converted to Date on client
    });
  } catch (error) {
    console.error('Unexpected error in messages API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

