import { ICPData, ICP_SECTIONS } from '@/types/icp';

/**
 * Extract structured data from AI summary messages
 */
function extractFromAISummary(message: string): Partial<ICPData> {
  const detected: Partial<ICPData> = {};
  const lowerMessage = message.toLowerCase();

  // Extract Company Size
  const companySizeMatch = message.match(/(?:company\s*size|size)[\s:]+([^\.\?\!]+)/i);
  if (companySizeMatch) {
    detected.target_demographics = (detected.target_demographics || '') + 'Size: ' + companySizeMatch[1].trim();
  }

  // Extract Industries
  const industriesMatch = message.match(/(?:industries?|sectors?)[\s:]+([^\.\?\!]+)/i);
  if (industriesMatch) {
    detected.target_demographics = (detected.target_demographics ? detected.target_demographics + ', ' : '') + 'Industries: ' + industriesMatch[1].trim();
  }

  // Extract Decision-Makers
  const decisionMakersMatch = message.match(/(?:decision[- ]?makers?|decision[- ]?maker\s*roles?)[\s:]+([^\.\?\!]+)/i);
  if (decisionMakersMatch) {
    detected.decision_makers = decisionMakersMatch[1].trim();
  }

  // Extract Pain Points
  const painPointsMatch = message.match(/(?:pain\s*points?)[\s:]+([^\.\?\!]+)/i);
  if (painPointsMatch) {
    detected.pain_points = painPointsMatch[1].trim();
  }

  // Extract Values
  const valuesMatch = message.match(/(?:values?)[\s:]+([^\.\?\!]+)/i);
  if (valuesMatch) {
    detected.target_psychographics = (detected.target_psychographics || '') + 'Values: ' + valuesMatch[1].trim();
  }

  // Extract Motivations
  const motivationsMatch = message.match(/(?:motivations?|motivated\s*by)[\s:]+([^\.\?\!]+)/i);
  if (motivationsMatch) {
    detected.target_psychographics = (detected.target_psychographics ? detected.target_psychographics + ', ' : '') + 'Motivations: ' + motivationsMatch[1].trim();
  }

  return detected;
}

/**
 * Analyze a message and extract ICP-related information
 * Returns partial ICPData with any detected information
 */
export function analyzeMessageForICP(message: string, role: 'user' | 'assistant'): Partial<ICPData> {
  // If it's an AI message, try to extract from structured summaries
  if (role === 'assistant') {
    const aiExtracted = extractFromAISummary(message);
    if (Object.keys(aiExtracted).length > 0) {
      return aiExtracted;
    }
  }
  const detected: Partial<ICPData> = {};
  const lowerMessage = message.toLowerCase();

  // Company Basics
  if (lowerMessage.includes('company') || lowerMessage.includes('business') || lowerMessage.includes('organization')) {
    // Extract company name (simple pattern matching)
    const companyNameMatch = message.match(/(?:company|business|organization|we are|we're|called)\s+(?:is|are|named|called)?\s*([A-Z][a-zA-Z\s&]+)/i);
    if (companyNameMatch && !detected.company_name) {
      detected.company_name = companyNameMatch[1].trim();
    }

    // Company size
    if (lowerMessage.match(/(\d+)\s*(?:employees|people|staff|team)/)) {
      const sizeMatch = message.match(/(\d+)\s*(?:employees|people|staff|team)/i);
      if (sizeMatch) {
        const size = parseInt(sizeMatch[1]);
        if (size < 10) detected.company_size = '1-10';
        else if (size < 50) detected.company_size = '11-50';
        else if (size < 200) detected.company_size = '51-200';
        else if (size < 1000) detected.company_size = '201-1000';
        else detected.company_size = '1000+';
      }
    }

    // Industry
    const industries = ['tech', 'technology', 'saas', 'software', 'healthcare', 'finance', 'retail', 'education', 'manufacturing', 'consulting', 'marketing', 'real estate'];
    for (const industry of industries) {
      if (lowerMessage.includes(industry)) {
        detected.industry = industry.charAt(0).toUpperCase() + industry.slice(1);
        break;
      }
    }

    // Location
    const locationMatch = message.match(/(?:located|based|in|from)\s+(?:in|at)?\s*([A-Z][a-zA-Z\s,]+(?:city|state|country|USA|US|United States)?)/i);
    if (locationMatch && !detected.location) {
      detected.location = locationMatch[1].trim();
    }
  }

  // Target Customer - More comprehensive detection
  if (lowerMessage.includes('target') || lowerMessage.includes('customer') || lowerMessage.includes('client') || 
      lowerMessage.includes('buyer') || lowerMessage.includes('company size') || lowerMessage.includes('mid-market') ||
      lowerMessage.includes('industries') || lowerMessage.includes('decision-maker')) {
    
    // Target customer type
    if (lowerMessage.includes('b2b') || lowerMessage.includes('business to business')) {
      detected.target_customer_type = 'B2B';
    } else if (lowerMessage.includes('b2c') || lowerMessage.includes('business to consumer')) {
      detected.target_customer_type = 'B2C';
    }

    // Company size (mid-market, enterprise, etc.)
    if (lowerMessage.includes('mid-market') || lowerMessage.match(/50-500|51-200|201-500/)) {
      detected.target_demographics = (detected.target_demographics || '') + 'Mid-market (50-500 employees)';
    } else if (lowerMessage.includes('enterprise') || lowerMessage.match(/500\+|1000\+/)) {
      detected.target_demographics = (detected.target_demographics || '') + 'Enterprise (500+ employees)';
    } else if (lowerMessage.includes('small business') || lowerMessage.match(/1-50|10-50/)) {
      detected.target_demographics = (detected.target_demographics || '') + 'Small business (1-50 employees)';
    }

    // Industries mentioned
    const industryMatch = message.match(/(?:industries?|sectors?|verticals?)[\s:]+([^\.\?\!]+)/i);
    if (industryMatch) {
      detected.target_demographics = (detected.target_demographics ? detected.target_demographics + ', ' : '') + industryMatch[1].trim();
    }

    // Decision makers
    const decisionMakerMatch = message.match(/(?:decision[- ]?makers?|decision[- ]?makers? roles?)[\s:]+([^\.\?\!]+)/i);
    if (decisionMakerMatch) {
      detected.decision_makers = decisionMakerMatch[1].trim();
    }
  }

  // Problem & Pain - More comprehensive
  if (lowerMessage.includes('problem') || lowerMessage.includes('pain') || lowerMessage.includes('challenge') || 
      lowerMessage.includes('issue') || lowerMessage.includes('struggle') || lowerMessage.includes('pain point')) {
    
    // Pain points - handle bullet format: "Pain points: x, y, z"
    const painPointMatch = message.match(/(?:pain\s*points?|pain\s*point)[\s:]+([^\n\.\?\!]+)/i);
    if (painPointMatch) {
      detected.pain_points = painPointMatch[1].trim();
    }
    
    // Problems
    const problemMatch = message.match(/(?:problem|problems|challenge|challenges|issue|issues|struggle)[s]?\s*(?:is|are|:)?\s*([^\n\.\?\!]+)/i);
    if (problemMatch && !detected.pain_points) {
      detected.main_problems = problemMatch[1].trim();
    }
    
    // Motivations/triggers - handle bullet format
    const motivationMatch = message.match(/(?:motivated\s*by|motivation|trigger|triggers)[\s:]+([^\n\.\?\!]+)/i);
    if (motivationMatch) {
      detected.target_psychographics = (detected.target_psychographics || '') + 'Motivated by: ' + motivationMatch[1].trim();
    }
  }

  // Budget
  if (lowerMessage.includes('budget') || lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('spend')) {
    const budgetMatch = message.match(/(?:budget|spend|price|cost)[s]?\s*(?:is|are|of|:)?\s*\$?([\d,]+(?:\s*(?:k|thousand|million))?)/i);
    if (budgetMatch) {
      detected.budget_range = budgetMatch[1].trim();
    }
  }

  // Decision Maker
  if (lowerMessage.includes('decision') || lowerMessage.includes('approve') || lowerMessage.includes('buyer')) {
    const decisionMatch = message.match(/(?:decision\s*maker|approver|buyer)[s]?\s*(?:is|are|:)?\s*([^\.\?\!]+)/i);
    if (decisionMatch) {
      detected.decision_maker_role = decisionMatch[1].trim();
    }
  }

  return detected;
}

/**
 * Check if a section is complete based on filled fields
 */
export function checkSectionComplete(section: typeof ICP_SECTIONS[0], icpData: ICPData): boolean {
  // A section is complete if at least 2 out of its fields are filled
  const filledFields = section.fields.filter(field => {
    const value = icpData[field as keyof ICPData];
    return value && typeof value === 'string' && value.trim().length > 0;
  });
  
  return filledFields.length >= 2;
}

/**
 * Update section completion status
 */
export function updateSectionCompletion(icpData: ICPData): ICPData {
  const updated = { ...icpData };
  
  for (const section of ICP_SECTIONS) {
    updated[section.completeKey as keyof ICPData] = checkSectionComplete(section, icpData) as any;
  }
  
  return updated;
}

