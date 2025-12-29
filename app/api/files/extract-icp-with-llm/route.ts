import { NextRequest, NextResponse } from 'next/server';

/**
 * Use LLM to extract structured ICP fields from PDF text
 * This ensures consistency between the AI's response and the auto-filled fields
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pdfText, fileName } = body;

    if (!pdfText) {
      return NextResponse.json(
        { error: 'PDF text is required' },
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

    // Use LLM to extract structured ICP data
    const extractionPrompt = `You are an expert at extracting Ideal Customer Profile (ICP) information from business documents.

Analyze the following document and extract structured ICP data. Be precise and only extract information that is explicitly stated in the document.

IMPORTANT RULES:
- Extract EXACT values from the document, not generic terms
- For company size, use the specific number if given (e.g., "45 employees"), otherwise use a range
- For location, extract city/state/country, NOT industry terms like "SaaS" or "Tech"
- For budget, extract ALL dollar amounts, pricing tiers, cost figures (e.g., "$499/mo, $1,499/mo, $80,000 monthly support")
- Skip table headers like "Title", "Seniority", "Pain Point", "Impact", etc.
- Extract detailed information - be thorough and comprehensive
- If a field is not clearly stated, mark it as "Not specified"
- For comprehensive ICP documents, extract everything - don't leave fields empty if the information exists anywhere in the document

Document to analyze:
"""
${pdfText.substring(0, 15000)}
"""

Extract the following fields in JSON format:
{
  "company_name": "Exact company name from document",
  "company_size": "Number of employees or size range",
  "industry": "Specific industry or business type",
  "location": "City, state, or country (NOT industry terms)",
  "target_customer_type": "B2B or B2C",
  "target_demographics": "Size, industries, or characteristics of target customers",
  "target_psychographics": "Values, beliefs, motivations of target customers",
  "main_problems": "Core problems the company solves",
  "pain_points": "Specific pain points customers face (not table headers)",
  "current_solutions": "How customers currently solve these problems",
  "decision_makers": "Roles of people who make buying decisions",
  "buying_process_steps": "Steps in the buying/approval process",
  "evaluation_criteria": "How customers evaluate solutions",
  "budget_range": "Budget, pricing, or cost information (include all dollar amounts found)",
  "decision_maker_role": "Specific role of primary decision maker",
  "approval_process": "How approvals are obtained"
}

Return ONLY valid JSON with these fields. Use "Not specified" for fields not found in the document.`;

    // Call OpenAI API
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
            content: 'You are an expert at extracting structured business information from documents. Always return valid JSON.',
          },
          {
            role: 'user',
            content: extractionPrompt,
          },
        ],
        temperature: 0.1, // Low temperature for consistent extraction
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', errorData);
      throw new Error(errorData.error?.message || 'Failed to extract ICP data');
    }

    const data = await response.json();
    const extractedContent = data.choices[0]?.message?.content;

    if (!extractedContent) {
      throw new Error('No content received from OpenAI');
    }

    // Parse the JSON response
    let extractedFields;
    try {
      extractedFields = JSON.parse(extractedContent);
    } catch (error) {
      console.error('Failed to parse LLM response:', extractedContent);
      throw new Error('Invalid JSON response from LLM');
    }

    // Filter out "Not specified" values
    const filteredFields: any = {};
    for (const [key, value] of Object.entries(extractedFields)) {
      if (value && typeof value === 'string' && value.trim() !== '' && 
          !value.toLowerCase().includes('not specified') &&
          !value.toLowerCase().includes('not found') &&
          !value.toLowerCase().includes('not mentioned')) {
        filteredFields[key] = value.trim();
      }
    }

    return NextResponse.json({
      success: true,
      extractedFields: filteredFields,
      rawExtraction: extractedFields, // Include full extraction for debugging
    });

  } catch (error: any) {
    console.error('Error extracting ICP with LLM:', error);
    return NextResponse.json(
      { 
        error: 'Failed to extract ICP data',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

