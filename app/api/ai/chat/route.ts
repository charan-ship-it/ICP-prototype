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

1. Company Basics: Company name, size, industry, location
2. Target Customer: Customer type (B2B/B2C), demographics, psychographics
3. Problem & Pain: Main problems, pain points, current solutions
4. Buying Process: Decision makers, buying process steps, evaluation criteria
5. Budget & Decision Maker: Budget range, decision maker role, approval process

IMPORTANT RULES:
- Use plain text only - NO markdown formatting (no **, ##, ###, *, - symbols)
- Write naturally as if speaking - responses will be read aloud via text-to-speech
- When a user uploads a PDF or document, the full content is automatically extracted and provided to you in the conversation. You CAN access and read uploaded files. Never say you cannot access files.
- ALWAYS check the conversation history and uploaded document content before asking any question
- If you see document content in the conversation, extract information from it directly
- If user says "it's in the document" or "I already provided that", STOP ASKING and trust the document. Move forward immediately.
- If a comprehensive ICP document is uploaded with all sections filled, acknowledge it's complete and offer to generate the final document instead of asking section-by-section questions
- If information is already provided in the conversation or documents, DO NOT ask for it again
- If a section is marked as complete, DO NOT ask questions about that section
- Focus ONLY on incomplete sections or sections that need more detail
- When a user confirms auto-filled information is correct, move to the next incomplete section
- Be conversational and efficient - don't repeat questions
- If you notice conflicting information (e.g., user says company A but PDF is for company B), ALWAYS ask which one to use

CONFLICT DETECTION:
- If the conversation mentions one company but the uploaded document is for a different company, ask: "I notice the document is for [PDF Company], but you mentioned your company is [Conversation Company]. Which company are we building the ICP for?"
- Always prioritize clarification over assumptions

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

      console.log('[AI Chat] ICP Progress:', { completedSections, incompleteSections });

      systemPrompt += `\n\nCurrent ICP Progress:
Completed sections: ${completedSections.length > 0 ? completedSections.join(', ') : 'None'}
Remaining sections: ${incompleteSections.length > 0 ? incompleteSections.join(', ') : 'All complete!'}

CRITICAL RULES:
- COMPLETED sections (${completedSections.join(', ')}): NEVER ask questions about these. They are DONE.
- If user uploaded a document with comprehensive ICP information, DO NOT ask them to repeat what's already in the document.
- If user says "it's in the document", trust the document and move forward.
- If ALL sections are complete, tell user: "Your ICP is complete! Click the 'Generate ICP Document' button below to create your final document."
- DO NOT generate or echo document content yourself - the system has a proper document generation feature.
${incompleteSections.length > 0 
  ? `INCOMPLETE sections: ${incompleteSections.join(', ')}. Focus on these ONLY if they truly lack information.`
  : 'All sections are complete! Tell the user to click the "Generate ICP Document" button that appeared below the chat.'
}`;

      // Add ALL filled data context so AI knows what's already been gathered
      const filledData: string[] = [];
      
      // Company Basics
      if (icpData.company_name) filledData.push(`Company Name: ${icpData.company_name}`);
      if (icpData.company_size) filledData.push(`Company Size: ${icpData.company_size}`);
      if (icpData.industry) filledData.push(`Industry: ${icpData.industry}`);
      if (icpData.location) filledData.push(`Location: ${icpData.location}`);
      
      // Target Customer
      if (icpData.target_customer_type) filledData.push(`Target Customer Type: ${icpData.target_customer_type}`);
      if (icpData.target_demographics) filledData.push(`Target Demographics: ${icpData.target_demographics}`);
      if (icpData.target_psychographics) filledData.push(`Target Psychographics: ${icpData.target_psychographics}`);
      
      // Problem & Pain
      if (icpData.main_problems) filledData.push(`Main Problems: ${icpData.main_problems}`);
      if (icpData.pain_points) filledData.push(`Pain Points: ${icpData.pain_points}`);
      if (icpData.current_solutions) filledData.push(`Current Solutions: ${icpData.current_solutions}`);
      
      // Buying Process
      if (icpData.decision_makers) filledData.push(`Decision Makers: ${icpData.decision_makers}`);
      if (icpData.buying_process_steps) filledData.push(`Buying Process Steps: ${icpData.buying_process_steps}`);
      if (icpData.evaluation_criteria) filledData.push(`Evaluation Criteria: ${icpData.evaluation_criteria}`);
      
      // Budget & Decision Maker
      if (icpData.budget_range) filledData.push(`Budget Range: ${icpData.budget_range}`);
      if (icpData.decision_maker_role) filledData.push(`Decision Maker Role: ${icpData.decision_maker_role}`);
      if (icpData.approval_process) filledData.push(`Approval Process: ${icpData.approval_process}`);
      
      if (filledData.length > 0) {
        systemPrompt += `\n\nInformation already gathered (DO NOT ask about these again):\n${filledData.join('\n')}`;
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
        max_tokens: 2000,
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

