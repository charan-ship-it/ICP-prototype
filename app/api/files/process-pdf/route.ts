import { NextRequest, NextResponse } from 'next/server';
import { analyzeMessageForICP, updateSectionCompletion } from '@/lib/icp-analyzer';
import { ICPData } from '@/types/icp';
import { createServerClient } from '@/lib/supabase';

/**
 * Process PDF file: Extract text, parse ICP fields, and auto-fill ICP data
 * Returns summary and extracted ICP fields
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const chatId = formData.get('chatId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId is required' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'File must be a PDF' },
        { status: 400 }
      );
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Extract text from PDF
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = '';
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      extractedText = data.text || '';
      
      if (!extractedText || extractedText.trim().length === 0) {
        return NextResponse.json(
          { 
            error: 'PDF appears to be empty or contains no extractable text',
            message: 'The PDF file does not contain any readable text content.'
          },
          { status: 400 }
        );
      }
    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('pdf-parse')) {
        return NextResponse.json(
          { 
            error: 'PDF parsing library not installed',
            message: 'Please install pdf-parse: npm install pdf-parse'
          },
          { status: 500 }
        );
      }
      throw error;
    }

    // Use LLM to extract structured ICP fields (more accurate than regex)
    console.log('[PDF Processing] Using LLM to extract ICP fields...');
    let detectedICP: Partial<ICPData> = {};
    
    try {
      const llmExtractionResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/files/extract-icp-with-llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pdfText: extractedText,
          fileName: file.name,
        }),
      });
      
      if (llmExtractionResponse.ok) {
        const llmData = await llmExtractionResponse.json();
        detectedICP = llmData.extractedFields || {};
        console.log('[PDF Processing] LLM extracted fields:', Object.keys(detectedICP));
      } else {
        console.warn('[PDF Processing] LLM extraction failed, falling back to regex');
        // Fallback to regex-based extraction
        const { analyzeMessageForICP } = await import('@/lib/icp-analyzer');
        detectedICP = analyzeMessageForICP(extractedText, 'user');
      }
    } catch (error) {
      console.error('[PDF Processing] LLM extraction error, falling back to regex:', error);
      // Fallback to regex-based extraction
      const { analyzeMessageForICP } = await import('@/lib/icp-analyzer');
      detectedICP = analyzeMessageForICP(extractedText, 'user');
    }
    
    // Get existing ICP data
    const supabase = createServerClient();
    const { data: existingICP } = await supabase
      .from('icp_data')
      .select('*')
      .eq('chat_id', chatId)
      .single();

    // Merge detected fields with existing data
    const currentICP: Partial<ICPData> = existingICP || { chat_id: chatId };
    const updatedICP = {
      ...currentICP,
      ...detectedICP,
    };

    // Update section completion
    let completedICP = updateSectionCompletion(updatedICP as ICPData);
    
    // If document is comprehensive and has most fields, mark all relevant sections as complete
    const hasCompanyInfo = detectedICP.company_name || detectedICP.industry || detectedICP.company_size || detectedICP.location;
    const hasTargetInfo = detectedICP.target_customer_type || detectedICP.target_demographics || detectedICP.target_psychographics;
    const hasPainInfo = detectedICP.pain_points || detectedICP.main_problems || detectedICP.current_solutions;
    const hasBuyingInfo = detectedICP.decision_makers || detectedICP.buying_process_steps || detectedICP.evaluation_criteria;
    const hasBudgetInfo = detectedICP.budget_range || detectedICP.decision_maker_role || detectedICP.approval_process;
    
    console.log('[PDF Processing] Section checks:', {
      hasCompanyInfo,
      hasTargetInfo,
      hasPainInfo,
      hasBuyingInfo,
      hasBudgetInfo,
    });
    
    // Mark sections as complete if document has the info
    if (hasCompanyInfo) {
      completedICP.company_basics_complete = true;
      console.log('[PDF Processing] Marked company_basics_complete = true');
    }
    if (hasTargetInfo) {
      completedICP.target_customer_complete = true;
      console.log('[PDF Processing] Marked target_customer_complete = true');
    }
    if (hasPainInfo) {
      completedICP.problem_pain_complete = true;
      console.log('[PDF Processing] Marked problem_pain_complete = true');
    }
    if (hasBuyingInfo) {
      completedICP.buying_process_complete = true;
      console.log('[PDF Processing] Marked buying_process_complete = true');
    }
    if (hasBudgetInfo) {
      completedICP.budget_decision_complete = true;
      console.log('[PDF Processing] Marked budget_decision_complete = true');
    }

    // Save to database
    const { data: savedICP, error: saveError } = await supabase
      .from('icp_data')
      .upsert(completedICP, { onConflict: 'chat_id' })
      .select('*')
      .single();

    if (saveError) {
      console.error('Error saving ICP data:', saveError);
      // Continue even if save fails - we'll still return the detected fields
    }

    // Generate summary of what was found
    const foundFields: string[] = [];
    if (detectedICP.company_name) foundFields.push('company name');
    if (detectedICP.company_size) foundFields.push('company size');
    if (detectedICP.industry) foundFields.push('industry');
    if (detectedICP.location) foundFields.push('location');
    if (detectedICP.target_customer_type) foundFields.push('target customer type');
    if (detectedICP.target_demographics) foundFields.push('target demographics');
    if (detectedICP.target_psychographics) foundFields.push('target psychographics');
    if (detectedICP.main_problems) foundFields.push('main problems');
    if (detectedICP.pain_points) foundFields.push('pain points');
    if (detectedICP.current_solutions) foundFields.push('current solutions');
    if (detectedICP.decision_makers) foundFields.push('decision makers');
    if (detectedICP.buying_process_steps) foundFields.push('buying process');
    if (detectedICP.evaluation_criteria) foundFields.push('evaluation criteria');
    if (detectedICP.budget_range) foundFields.push('budget range');
    if (detectedICP.decision_maker_role) foundFields.push('decision maker role');
    if (detectedICP.approval_process) foundFields.push('approval process');

    // Determine which sections were filled
    const filledSections: string[] = [];
    if (detectedICP.company_name || detectedICP.company_size || detectedICP.industry || detectedICP.location) {
      filledSections.push('Company Basics');
    }
    if (detectedICP.target_customer_type || detectedICP.target_demographics || detectedICP.target_psychographics) {
      filledSections.push('Target Customer');
    }
    if (detectedICP.main_problems || detectedICP.pain_points || detectedICP.current_solutions) {
      filledSections.push('Problem & Pain');
    }
    if (detectedICP.decision_makers || detectedICP.buying_process_steps || detectedICP.evaluation_criteria) {
      filledSections.push('Buying Process');
    }
    if (detectedICP.budget_range || detectedICP.decision_maker_role || detectedICP.approval_process) {
      filledSections.push('Budget & Decision Maker');
    }

    // Check for conflicts with existing data
    let conflictWarning = '';
    if (existingICP) {
      // Check company name conflict
      if (existingICP.company_name && detectedICP.company_name && 
          existingICP.company_name !== detectedICP.company_name) {
        conflictWarning = `\n\nI notice the document is for ${detectedICP.company_name}, but you previously mentioned your company is ${existingICP.company_name}. Which company should we use for the ICP?`;
      }
    }
    
    // Generate summary message
    let summary = '';
    if (foundFields.length > 0) {
      summary = `I've reviewed your document "${file.name}". I found information about `;
      if (filledSections.length > 0) {
        summary += filledSections.join(', ').toLowerCase();
      }
      summary += '. ';
      
      if (conflictWarning) {
        summary += conflictWarning;
      } else if (filledSections.length >= 4) {
        // Document is comprehensive
        summary += `This document contains comprehensive ICP information covering all major sections. I've extracted the key details. Your ICP is essentially complete - would you like me to generate the final ICP document now?`;
      } else if (filledSections.length > 0) {
        summary += `I've extracted information for ${filledSections.length} section${filledSections.length > 1 ? 's' : ''}. Let me know if you'd like to add anything or if we should continue with the remaining sections.`;
      } else {
        summary += `However, I couldn't extract structured ICP information. Could you help me understand your target customers better?`;
      }
    } else {
      summary = `I've reviewed your document "${file.name}", but I couldn't extract specific ICP information from it. Could you help me understand your target customers by answering a few questions?`;
    }

    return NextResponse.json({
      summary,
      extractedFields: detectedICP,
      filledSections,
      icpData: savedICP || completedICP,
      extractedText: extractedText.substring(0, 10000), // Return first 10k chars for AI context
    });
  } catch (error: any) {
    console.error('Error processing PDF:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process PDF',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

