import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ICPData } from '@/types/icp';

// GET: Get ICP data for a chat
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

    // Get ICP data for this chat
    const { data: icpData, error } = await supabase
      .from('icp_data')
      .select('*')
      .eq('chat_id', chatId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is fine (no ICP data yet)
      console.error('Error fetching ICP data:', error);
      return NextResponse.json(
        { error: 'Failed to fetch ICP data' },
        { status: 500 }
      );
    }

    // Return ICP data or null if not found
    return NextResponse.json(icpData || null);
  } catch (error) {
    console.error('Unexpected error in ICP API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Shared update logic for PATCH and PUT
async function updateICPData(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const supabase = createServerClient();
    const { chatId } = await params;
    const body = await request.json();
    const updates: Partial<ICPData> = body;

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
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

    // Check if ICP data exists
    const { data: existingData } = await supabase
      .from('icp_data')
      .select('id')
      .eq('chat_id', chatId)
      .single();

    let result;
    if (existingData) {
      // Update existing ICP data
      const { data, error } = await supabase
        .from('icp_data')
        .update(updates)
        .eq('chat_id', chatId)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating ICP data:', error);
        return NextResponse.json(
          { error: 'Failed to update ICP data' },
          { status: 500 }
        );
      }
      result = data;
    } else {
      // Create new ICP data
      const { data, error } = await supabase
        .from('icp_data')
        .insert({
          chat_id: chatId,
          ...updates,
        })
        .select('*')
        .single();

      if (error) {
        console.error('Error creating ICP data:', error);
        return NextResponse.json(
          { error: 'Failed to create ICP data' },
          { status: 500 }
        );
      }
      result = data;
    }

    console.log('[ICP Update] Successfully updated ICP data:', {
      chatId,
      fieldsUpdated: Object.keys(updates),
      completionStatus: {
        company_basics: result.company_basics_complete,
        target_customer: result.target_customer_complete,
        problem_pain: result.problem_pain_complete,
        buying_process: result.buying_process_complete,
        budget_decision: result.budget_decision_complete,
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Unexpected error in ICP API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH: Update ICP data for a chat
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  return updateICPData(request, { params });
}

// PUT: Update ICP data for a chat (same as PATCH)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  return updateICPData(request, { params });
}

