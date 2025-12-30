import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params;

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId is required' },
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

    const supabase = createServerClient();
    
    // Get ICP data
    const { data: icpData, error: icpError } = await supabase
      .from('icp_data')
      .select('*')
      .eq('chat_id', chatId)
      .single();

    if (icpError || !icpData) {
      return NextResponse.json(
        { error: 'ICP data not found' },
        { status: 404 }
      );
    }

    // Get conversation history
    const { data: messages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    const conversationContext = messages?.map(m => `${m.role}: ${m.content}`).join('\n\n') || '';

    // Generate document with LLM
    const prompt = `You are creating a professional Ideal Customer Profile (ICP) document.

Use ALL the information provided below to create a comprehensive, well-formatted ICP document.

COLLECTED ICP DATA:
${JSON.stringify(icpData, null, 2)}

CONVERSATION HISTORY (for additional context):
${conversationContext.substring(0, 10000)}

Create a professional ICP document with these sections:

1. COMPANY OVERVIEW
   - Company Name
   - Industry
   - Size
   - Location
   - Brief Description

2. TARGET CUSTOMER
   - Customer Type (B2B/B2C)
   - Firmographics (company size, revenue, industry)
   - Demographics (decision maker roles, titles)
   - Psychographics (beliefs, motivations, frustrations)

3. PROBLEMS & PAIN POINTS
   - Top challenges they face
   - Specific pain points with impact
   - Current solutions they use
   - Quantified pain (costs, time, metrics)

4. BUYING PROCESS
   - Key decision makers and their roles
   - Buying stages and typical timeline
   - Evaluation criteria
   - Decision-making process

5. BUDGET & DECISION MAKING
   - Budget range
   - Budget holder
   - Approval process
   - Financial considerations

6. VALUE PROPOSITION & POSITIONING
   - How solutions should address their pain
   - Key benefits they seek
   - Success metrics they care about

IMPORTANT:
- Use plain text only, NO markdown formatting (no **, ##, ###, *, -)
- Write in a clear, professional business tone
- Include all specific details from the data
- Use section headers with numbers (1. SECTION NAME)
- Use bullet points with simple dashes (-)
- If a field is missing, skip it rather than saying "not provided"

Output the complete ICP document now:`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert business analyst creating professional ICP documents. Use plain text formatting only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to generate document');
    }

    const data = await response.json();
    const generatedDocument = data.choices[0]?.message?.content;

    if (!generatedDocument) {
      throw new Error('No document generated');
    }

    // Save generated document to ICP data
    // Note: generated_document column may not exist in all schemas
    // If it doesn't exist, we'll just return the document without saving
    const { error: updateError } = await supabase
      .from('icp_data')
      .update({ 
        generated_document: generatedDocument,
        updated_at: new Date().toISOString(),
      })
      .eq('chat_id', chatId);

    if (updateError) {
      // If error is about missing column, that's okay - we'll just return the document
      if (updateError.code === 'PGRST204' || updateError.message?.includes('generated_document')) {
        console.log('Note: generated_document column not found in schema. Document will be returned but not saved to database.');
      } else {
        console.error('Error saving generated document:', updateError);
      }
    }

    return NextResponse.json({
      success: true,
      document: generatedDocument,
    });

  } catch (error: any) {
    console.error('Error generating document:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate document',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

