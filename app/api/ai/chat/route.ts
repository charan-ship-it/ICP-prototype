import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// POST: Generate AI response based on chat history
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chatId } = body;

    if (!chatId) {
      return NextResponse.json(
        { error: 'chat_id is required' },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Get chat history and ICP data from database
    const supabase = createServerClient();
    const [messagesResult, icpResult] = await Promise.all([
      supabase
        .from('messages')
        .select('role, content')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true }),
      supabase
        .from('icp_data')
        .select('*')
        .eq('chat_id', chatId)
        .single(),
    ]);

    if (messagesResult.error) {
      console.error('Error fetching messages:', messagesResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch chat history' },
        { status: 500 }
      );
    }

    const messages = messagesResult.data || [];
    const icpData = icpResult.data;

    // Format messages for OpenAI API
    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Build system prompt with ICP context
    let systemPrompt = `You are Alex a helpful AI assistant that guides users through building their Ideal Customer Profile (ICP). Your goal is to help them complete all 5 ICP sections:

1. **Company Basics**: Company name, size, industry, location
2. **Target Customer**: Customer type (B2B/B2C), demographics, psychographics
3. **Problem & Pain**: Main problems, pain points, current solutions
4. **Buying Process**: Decision makers, buying process steps, evaluation criteria
5. **Budget & Decision Maker**: Budget range, decision maker role, approval process

Be conversational, ask natural follow-up questions, and help them think through each aspect. Focus on one section at a time, and move to the next section once the current one is well understood.`;

    // Add ICP progress context if available
    if (icpData) {
      const sections = [
        { name: 'Company Basics', complete: icpData.company_basics_complete },
        { name: 'Target Customer', complete: icpData.target_customer_complete },
        { name: 'Problem & Pain', complete: icpData.problem_pain_complete },
        { name: 'Buying Process', complete: icpData.buying_process_complete },
        { name: 'Budget & Decision Maker', complete: icpData.budget_decision_complete },
      ];

      const completedSections = sections.filter(s => s.complete).map(s => s.name);
      const incompleteSections = sections.filter(s => !s.complete).map(s => s.name);

      systemPrompt += `\n\n**Current ICP Progress:**
- Completed sections: ${completedSections.length > 0 ? completedSections.join(', ') : 'None'}
- Remaining sections: ${incompleteSections.length > 0 ? incompleteSections.join(', ') : 'All complete!'}

Focus on the next incomplete section: ${incompleteSections[0] || 'All sections are complete. You can help refine or expand on any section.'}`;

      // Add filled data context
      const filledData: string[] = [];
      if (icpData.company_name) filledData.push(`Company: ${icpData.company_name}`);
      if (icpData.industry) filledData.push(`Industry: ${icpData.industry}`);
      if (icpData.target_customer_type) filledData.push(`Target: ${icpData.target_customer_type}`);
      if (filledData.length > 0) {
        systemPrompt += `\n\n**Information already gathered:** ${filledData.join(', ')}`;
      }
    } else {
      systemPrompt += `\n\n**Current Status:** Starting fresh - begin with Company Basics.`;
    }

    // Call OpenAI API with streaming
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          ...formattedMessages,
        ],
        temperature: 0.7,
        max_tokens: 1000,
        stream: true, // Enable streaming
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to generate AI response', details: errorData },
        { status: response.status }
      );
    }

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  // Save complete message to database
                  const { data: savedMessage, error: saveError } = await supabase
                    .from('messages')
                    .insert({
                      chat_id: chatId,
                      role: 'assistant',
                      content: fullContent,
                    })
                    .select('id, role, content, created_at')
                    .single();

                  if (saveError) {
                    console.error('Error saving AI message:', saveError);
                    try {
                      controller.enqueue(
                        new TextEncoder().encode(
                          `data: ${JSON.stringify({ error: 'Failed to save message' })}\n\n`
                        )
                      );
                    } catch (e) {
                      // Controller already closed (client disconnected/aborted)
                      console.log('Client disconnected before final message could be sent');
                    }
                  } else {
                    try {
                      controller.enqueue(
                        new TextEncoder().encode(
                          `data: ${JSON.stringify({ done: true, message: savedMessage })}\n\n`
                        )
                      );
                    } catch (e) {
                      // Controller already closed (client disconnected/aborted)
                      console.log('Client disconnected before final message could be sent');
                    }
                  }
                  
                  try {
                    controller.close();
                  } catch (e) {
                    // Already closed, ignore
                  }
                  return;
                }

                try {
                  const json = JSON.parse(data);
                  const content = json.choices[0]?.delta?.content || '';
                  if (content) {
                    fullContent += content;
                    try {
                      controller.enqueue(
                        new TextEncoder().encode(
                          `data: ${JSON.stringify({ content })}\n\n`
                        )
                      );
                    } catch (enqueueError) {
                      // Controller closed (client disconnected/aborted) - stop processing
                      console.log('Client disconnected, stopping stream processing');
                      return;
                    }
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        } catch (error) {
          console.error('Streaming error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Unexpected error in AI chat API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

