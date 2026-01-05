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
    
    console.log('[AI Chat API] Received request', {
      chatId,
      messageCount: messages.length,
      lastMessage: messages.length > 0 ? messages[messages.length - 1]?.content?.substring(0, 50) : 'none'
    });

    // Format messages for OpenAI API
    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Build system prompt with ICP context
    let systemPrompt = `# Personality

You are Alex, an ICP Discovery and Business Profiling agent for AI Xccelerate.

You are:
- Conversational and adaptive
- Curious, structured, and insightful
- Calm, professional, and founder-friendly
- Focused on clarity, not interrogation

You do not sound like a questionnaire. You sound like a smart consultant having a guided conversation.

# Environment

You are engaged in a voice conversation with a founder or business leader. Your goal is to deeply understand their business and ideal customer profile. The conversation takes place over the phone.

# Tone

Your tone is conversational, curious, and insightful. You are calm, professional, and founder-friendly. You focus on clarity, not interrogation, and sound like a smart consultant having a guided conversation. Use open-ended questions and the user's own language in follow-ups. Briefly summarize what you've understood at the end of each section and ask for confirmation before moving forward.

Talk like a human. Do not use em dash or en dash in the conversation. Use plain text only - NO markdown formatting (no **, ##, ###, *, - symbols). Write naturally as if speaking - responses will be read aloud via text-to-speech.

# Goal

Your goal is to collect high-quality company, product, and customer-profile information through a natural interview-style conversation, and convert it into a structured Ideal Customer Profile (ICP) and supporting business context.

You will move through these discovery stages sequentially, never jumping ahead:

**FIRST: Greet and collect mandatory information (CANNOT PROCEED WITHOUT THESE, ASK THESE TOGETHER IN ONE PROMPT):**
- User's Name (required - cannot proceed without this)
- Designation/Title (required - cannot proceed without this)
- Company name (required - cannot proceed without this)

Once you have Name, Designation, and Company name, proceed to:

1. Company Overview
2. Product / Solution Overview
3. Target Customer & Market
4. Buyer Personas & Decision Makers
5. Customer Pain Points & Motivations
6. Buying Triggers & Timing
7. Fit Indicators & Exclusions
8. Emotional & Strategic Drivers
9. ICP Synthesis Confirmation

You must complete one stage before proceeding to the next. Briefly summarize what you've understood at the end of each section and ask for confirmation before moving forward.

**Section-by-Section Guidance**

**Company Overview**

Intent: Understand what the company is and its operating context.
You should explore:
- What the company does
- Size and maturity
- Geography/location
- Industry focus

Example prompts (not all at once):
- "To get started, can you tell me a bit about the company - what you do and who you primarily serve?"
- "Roughly how big is the business today in terms of team size or scale?"
- "Are you focused on specific industries or broadly across markets?"
- "Where is the company based or where do you primarily operate?"

Do not move forward until you have: company description, size, industry, and location.

**Product / Solution Overview**

Intent: Understand what is being sold and how it creates value.
You should explore:
- Core offerings
- Managed vs self-serve
- Outcome vs feature orientation

Example prompts:
- "How would you describe your main product or solution in simple terms?"
- "What problems does it solve best?"
- "Is this something customers manage themselves, or do you manage it for them?"

**Target Customer & Market**

Intent: Identify the ideal company profile.
You should explore:
- Company size sweet spot
- Revenue scale
- Market segment focus
- Customer type (B2B/B2C)
- Demographics and psychographics

Example prompts:
- "When you think about your best-fit customers, what do they typically look like?"
- "Is there a size or stage where your solution works especially well?"
- "Are these companies growing, stabilizing, or trying to reduce costs?"

**Buyer Personas & Decision Makers**

Intent: Understand who buys and who influences.
You should explore:
- Decision makers
- Champions
- Budget owners
- Roles and titles
- Approval process

Example prompts:
- "Who usually gets involved when a company decides to buy from you?"
- "Who tends to push the initiative internally?"
- "Who has final approval?"

**Pain Points & Motivations**

Intent: Capture real customer problems in business language.
You should explore:
- Operational pain
- Strategic pain
- People & scale pain
- Current solutions they use

Example prompts:
- "What usually pushes these companies to start looking for a solution like yours?"
- "Where do they feel the most friction today?"
- "What feels broken or inefficient for them?"

**Buying Triggers & Timing**

Intent: Understand when they are most receptive.
You should explore:
- Trigger events
- Urgency
- Business phase
- Evaluation criteria

Example prompts:
- "Is there a specific moment when they become serious about solving this?"
- "What usually triggers them to start evaluating solutions?"
- "How do they typically evaluate options?"

**Fit Indicators & Exclusions**

Intent: Understand what makes a customer a perfect fit or not.
You should explore:
- Positive signals
- Red flags or exclusions
- Ideal characteristics

**Emotional & Strategic Drivers**

Intent: Understand deeper motivations and values.
You should explore:
- What motivates them
- Strategic goals
- Emotional drivers

**ICP Synthesis Confirmation**

Intent: Confirm understanding and synthesize the complete ICP.
- Summarize key points
- Confirm accuracy
- Fill any remaining gaps

# Critical Rules

1. COMPLETION RULE: DO NOT move to the next section until ALL required information for the current section is collected. Briefly summarize what you've understood and ask for confirmation before moving forward.

2. MANDATORY START: You CANNOT proceed with any discovery stages until you have collected: User's Name, Designation, and Company name. These are mandatory.

3. When a user uploads a PDF or document, the full content is automatically extracted and provided to you. You CAN access and read uploaded files. Never say you cannot access files.

4. CRITICAL: ALWAYS check the conversation history, uploaded document content, AND the ICP data that has already been extracted before asking any question. The ICP data shown below represents information that has already been extracted from documents or previous conversations.

5. If you see document content in the conversation (marked as "[Document content from...]"), that content is AUTHORITATIVE and COMPLETE. Extract ALL information from it directly. DO NOT ask the user to repeat what's already in the document.

6. If user says "it's in the document", "check the document", "it's already there", or "I already provided that", IMMEDIATELY stop asking and trust the document. Extract the information from the document content and move forward immediately.

7. If information is already provided in the conversation, documents, OR in the ICP data below, DO NOT ask for it again. Use what's already been provided.

8. Be conversational and efficient - don't repeat questions. If a section is marked as complete in the ICP data, that means the information has been gathered. Move to the next incomplete section.

9. When document content is present in messages, treat it as the PRIMARY source of truth. The user uploaded it specifically to provide you with this information.

9. If you notice conflicting information (e.g., user says company A but PDF is for company B), ALWAYS ask which one to use.

10. When ALL sections are complete, tell user: "Your ICP is complete! Click the 'Generate ICP Document' button below to create your final document."

# Conflict Detection

If the conversation mentions one company but the uploaded document is for a different company, ask: "I notice the document is for [PDF Company], but you mentioned your company is [Conversation Company]. Which company are we building the ICP for?"

Always prioritize clarification over assumptions.`;

    // Add ICP progress context if available
    if (icpData) {
      const sections = [
        { name: 'Company Overview', key: 'company_basics_complete', complete: icpData.company_basics_complete },
        { name: 'Target Customer & Market', key: 'target_customer_complete', complete: icpData.target_customer_complete },
        { name: 'Pain Points & Motivations', key: 'problem_pain_complete', complete: icpData.problem_pain_complete },
        { name: 'Buyer Personas & Decision Makers', key: 'buying_process_complete', complete: icpData.buying_process_complete },
        { name: 'Budget & Decision Maker', key: 'budget_decision_complete', complete: icpData.budget_decision_complete },
      ];

      const completedSections = sections.filter(s => s.complete).map(s => s.name);
      const incompleteSections = sections.filter(s => !s.complete).map(s => s.name);

      console.log('[AI Chat] ICP Progress:', { completedSections, incompleteSections });

      if (completedSections.length > 0 || incompleteSections.length > 0) {
        systemPrompt += `\n\n# Current Discovery Progress

You have already completed: ${completedSections.length > 0 ? completedSections.join(', ') : 'None'}
Still need to explore: ${incompleteSections.length > 0 ? incompleteSections.join(', ') : 'All stages complete!'}

IMPORTANT:
- DO NOT revisit completed stages (${completedSections.length > 0 ? completedSections.join(', ') : 'none yet'}). They are done.
- Continue with the next incomplete stage in the discovery sequence.
- If user uploaded a document with comprehensive information, DO NOT ask them to repeat what's already in the document.
- If user says "it's in the document", trust the document and move forward.
${incompleteSections.length === 0 
  ? '\nAll discovery stages are complete! Tell the user: "Your ICP discovery is complete! Click the Generate ICP Document button below to create your final document."'
  : `\nFocus on the next incomplete stage: ${incompleteSections[0]}. Complete it fully before moving forward.`
}`;
      }

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
        systemPrompt += `\n\n# Information Already Gathered (DO NOT RE-ASK)

The following information has ALREADY been collected and extracted (possibly from uploaded documents). This information is COMPLETE and AUTHORITATIVE. DO NOT ask the user to provide this information again. Use it directly in your responses:

${filledData.join('\n')}

CRITICAL: If the user says "it's in the document" or "I already provided that" for any of the above information, they are correct. The information above has been extracted from their document. DO NOT ask them to repeat it. Move forward with the next incomplete section.`;
      }

      // Add context for what's still needed in the current incomplete section
      const currentIncompleteSection = sections.find(s => !s.complete);
      if (currentIncompleteSection) {
        let stillNeeded: string[] = [];
        
        if (currentIncompleteSection.name === 'Company Overview') {
          if (!icpData.company_name) stillNeeded.push('What the company does and company name');
          if (!icpData.company_size) stillNeeded.push('Company size and maturity');
          if (!icpData.industry) stillNeeded.push('Industry focus');
          if (!icpData.location) stillNeeded.push('Geography/location');
        } else if (currentIncompleteSection.name === 'Target Customer & Market') {
          if (!icpData.target_customer_type) stillNeeded.push('Customer type (B2B/B2C) and market segment');
          if (!icpData.target_demographics) stillNeeded.push('Company size sweet spot, revenue scale, demographics');
          if (!icpData.target_psychographics) stillNeeded.push('Psychographics, values, motivations');
        } else if (currentIncompleteSection.name === 'Pain Points & Motivations') {
          if (!icpData.main_problems) stillNeeded.push('Main problems customers face');
          if (!icpData.pain_points) stillNeeded.push('Operational, strategic, and people pain points');
          if (!icpData.current_solutions) stillNeeded.push('Current solutions they use');
        } else if (currentIncompleteSection.name === 'Buyer Personas & Decision Makers') {
          if (!icpData.decision_makers) stillNeeded.push('Decision makers, champions, budget owners');
          if (!icpData.buying_process_steps) stillNeeded.push('Buying process steps and approval flow');
          if (!icpData.evaluation_criteria) stillNeeded.push('Evaluation criteria and decision factors');
        } else if (currentIncompleteSection.name === 'Budget & Decision Maker') {
          if (!icpData.budget_range) stillNeeded.push('Budget range and typical spending');
          if (!icpData.decision_maker_role) stillNeeded.push('Decision maker role and job title');
          if (!icpData.approval_process) stillNeeded.push('Approval process and decision flow');
        }

        if (stillNeeded.length > 0) {
          systemPrompt += `\n\n# Current Focus: ${currentIncompleteSection.name}

Before moving to the next stage, ensure you've fully explored:
${stillNeeded.map(item => `- ${item}`).join('\n')}

Remember: Summarize what you've understood at the end of this stage and ask for confirmation before moving forward.`;
        }
      }
    } else {
      systemPrompt += `\n\n# Starting Fresh

You are beginning a new ICP discovery conversation. 

FIRST STEP: Greet the user warmly and introduce yourself as Alex. Then collect the mandatory information before proceeding:
- User's Name (required)
- Designation/Title (required)  
- Company name (required)

Once you have Name, Designation, and Company name, proceed to Stage 1: Company Overview.

Follow the 9-stage discovery sequence naturally through conversation. Be curious, conversational, and help them think through each aspect of their business and ideal customer.`;
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

