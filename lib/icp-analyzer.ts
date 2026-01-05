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
// Helper to validate extracted value (filter out garbage/headers/placeholders)
function isValidExtractedValue(value: string, fieldType: string): boolean {
  if (!value || value.trim().length < 2) return false;

  const valueLower = value.toLowerCase().trim();

  // Common table headers and garbage text
  const invalidPatterns = [
    'profile', 'example', 'sample', 'template', 'placeholder',
    'insert', 'your', 'company name', 'title', 'seniority',
    'pain point', 'impact', 'severity', 'description',
    'role', 'decision maker', 'header', 'column',
    'n/a', 'tbd', 'todo', 'xxx', '___', '...',
  ];

  // Check if it's a table header or placeholder
  for (const pattern of invalidPatterns) {
    if (valueLower === pattern || valueLower.includes(pattern)) {
      return false;
    }
  }

  // Field-specific validation
  if (fieldType === 'location') {
    // Location shouldn't be "SaaS", "Tech", etc.
    if (valueLower.match(/^(saas|tech|b2b|b2c|software)$/)) return false;
  }

  if (fieldType === 'budget') {
    // Budget should have numbers or ranges
    if (!valueLower.match(/\d/) && !valueLower.match(/k|m|thousand|million/)) return false;
  }

  // Must have at least some meaningful content
  if (value.match(/^[^a-zA-Z0-9]+$/)) return false; // Only special chars

  return true;
}

/**
 * Validate company name - reject question patterns and invalid text
 */
export function isValidCompanyName(text: string): boolean {
  if (!text || text.trim().length < 2) return false;

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Reject if too long
  if (trimmed.length > 100) return false;

  // Reject if doesn't start with capital letter (likely not a proper name)
  if (!/^[A-Z]/.test(trimmed)) return false;

  // Reject question patterns
  const questionPatterns = [
    /^overview/i,
    /^can you/i,
    /^tell me/i,
    /^how about/i,
    /^what is/i,
    /^what are/i,
    /^could you/i,
    /^would you/i,
    /^please/i,
  ];

  for (const pattern of questionPatterns) {
    if (pattern.test(trimmed)) return false;
  }

  // Reject if contains question marks or common question words
  if (trimmed.includes('?') ||
    lower.includes('overview') ||
    lower.includes('tell me') ||
    lower.includes('can you') ||
    lower.includes('how about')) {
    return false;
  }

  // Reject if it's clearly a sentence/question (contains multiple words that form a question)
  if (lower.match(/^(overview|can you|tell me|how about|what is|what are).+/)) {
    return false;
  }

  // Use general validation
  return isValidExtractedValue(trimmed, 'company_name');
}

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

  // Company Basics - Improved extraction
  if (lowerMessage.includes('company') || lowerMessage.includes('business') || lowerMessage.includes('organization') ||
    lowerMessage.includes('we are') || lowerMessage.includes("we're") || lowerMessage.includes('our company')) {

    // Extract company name (improved patterns)
    const companyNamePatterns = [
      /(?:company|business|organization|we are|we're|called|named)\s+(?:is|are|named|called)?\s*([A-Z][a-zA-Z\s&.,'-]+)/i,
      /(?:my|our)\s+(?:company|business|organization)\s+(?:is|are|called|named)?\s*([A-Z][a-zA-Z\s&.,'-]+)/i,
      /^([A-Z][a-zA-Z\s&.,'-]+)\s+(?:is|are)\s+(?:my|our|a|the)\s+(?:company|business)/i,
    ];

    for (const pattern of companyNamePatterns) {
      const match = message.match(pattern);
      if (match && !detected.company_name && match[1].trim().length > 2 && match[1].trim().length < 100) {
        const name = match[1].trim();
        // Validate using company name specific validation
        if (isValidCompanyName(name)) {
          detected.company_name = name;
          break;
        }
      }
    }

    // Company size - improved patterns
    const sizePatterns = [
      /(\d+)\s*(?:employees?|people|staff|team\s*members?)/i,
      /(?:about|around|approximately|roughly)\s+(\d+)\s*(?:people|employees?)/i,
      /(?:size|team)\s+(?:of|is|has)?\s*(\d+)/i,
      /(?:small|medium|large|enterprise|startup)\s+(?:company|business|organization)/i,
    ];

    for (const pattern of sizePatterns) {
      const match = message.match(pattern);
      if (match) {
        if (match[1]) {
          const size = parseInt(match[1]);
          if (size < 10) detected.company_size = '1-10';
          else if (size < 50) detected.company_size = '11-50';
          else if (size < 200) detected.company_size = '51-200';
          else if (size < 1000) detected.company_size = '201-1000';
          else detected.company_size = '1000+';
        } else {
          // Handle text-based size descriptions
          if (lowerMessage.includes('small')) detected.company_size = '1-50';
          else if (lowerMessage.includes('medium') || lowerMessage.includes('mid-market')) detected.company_size = '51-200';
          else if (lowerMessage.includes('large') || lowerMessage.includes('enterprise')) detected.company_size = '201-1000';
          else if (lowerMessage.includes('startup')) detected.company_size = '1-10';
        }
        break;
      }
    }

    // Industry - expanded list and better matching
    const industries = [
      'tech', 'technology', 'saas', 'software', 'healthcare', 'health care', 'finance', 'financial',
      'retail', 'education', 'manufacturing', 'consulting', 'marketing', 'real estate', 'realestate',
      'e-commerce', 'ecommerce', 'hospitality', 'travel', 'automotive', 'energy', 'telecommunications',
      'media', 'entertainment', 'legal', 'insurance', 'construction', 'agriculture', 'pharmaceutical',
      'biotech', 'aerospace', 'defense', 'government', 'non-profit', 'nonprofit', 'ngo'
    ];

    for (const industry of industries) {
      if (lowerMessage.includes(industry)) {
        // Capitalize properly
        const capitalized = industry.split(/[\s-]/).map(word =>
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(industry.includes('-') ? '-' : ' ');
        detected.industry = capitalized;
        break;
      }
    }

    // Location - improved patterns
    const locationPatterns = [
      /(?:located|based|in|from|operate\s+in)\s+(?:in|at)?\s*([A-Z][a-zA-Z\s,]+(?:city|state|country|USA|US|United States|UK|United Kingdom)?)/i,
      /(?:we|our|my)\s+(?:are|is)\s+(?:in|at|from)\s+([A-Z][a-zA-Z\s,]+)/i,
    ];

    for (const pattern of locationPatterns) {
      const match = message.match(pattern);
      if (match && !detected.location && match[1].trim().length > 2 && match[1].trim().length < 100) {
        const location = match[1].trim();
        // Validate location (shouldn't be industry terms)
        if (isValidExtractedValue(location, 'location')) {
          detected.location = location;
          break;
        }
      }
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

  // Problem & Pain - More comprehensive extraction
  if (lowerMessage.includes('problem') || lowerMessage.includes('pain') || lowerMessage.includes('challenge') ||
    lowerMessage.includes('issue') || lowerMessage.includes('struggle') || lowerMessage.includes('pain point') ||
    lowerMessage.includes('difficulty') || lowerMessage.includes('frustration') || lowerMessage.includes('barrier')) {

    // Pain points - improved patterns
    const painPointPatterns = [
      /(?:pain\s*points?|pain\s*point)[\s:]+([^\n\.\?\!]+)/i,
      /(?:they|customers|clients|users)\s+(?:have|face|experience|struggle\s+with|deal\s+with)\s+([^\n\.\?\!]+)/i,
      /(?:main|primary|key)\s+(?:pain|problem|challenge|issue)[\s:]+([^\n\.\?\!]+)/i,
    ];

    for (const pattern of painPointPatterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 5) {
        const painPoints = match[1].trim();
        // Validate pain points (not table headers)
        if (isValidExtractedValue(painPoints, 'pain_points')) {
          detected.pain_points = painPoints;
          break;
        }
      }
    }

    // Problems - improved patterns
    const problemPatterns = [
      /(?:problem|problems|challenge|challenges|issue|issues|struggle)[s]?\s*(?:is|are|:)?\s*([^\n\.\?\!]+)/i,
      /(?:the|their|main|primary)\s+(?:problem|challenge|issue)\s+(?:is|are|that)\s+([^\n\.\?\!]+)/i,
    ];

    for (const pattern of problemPatterns) {
      const match = message.match(pattern);
      if (match && !detected.pain_points && match[1].trim().length > 5) {
        detected.main_problems = match[1].trim();
        break;
      }
    }

    // Current solutions
    const solutionPatterns = [
      /(?:currently|they|customers)\s+(?:use|are\s+using|have|rely\s+on)\s+([^\n\.\?\!]+)/i,
      /(?:current|existing)\s+(?:solution|solutions|tool|tools|system|systems)[\s:]+([^\n\.\?\!]+)/i,
    ];

    for (const pattern of solutionPatterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 5) {
        detected.current_solutions = match[1].trim();
        break;
      }
    }

    // Motivations/triggers - improved patterns
    const motivationPatterns = [
      /(?:motivated\s*by|motivation|trigger|triggers|driven\s+by)[\s:]+([^\n\.\?\!]+)/i,
      /(?:they|customers)\s+(?:are|get)\s+(?:motivated|driven)\s+(?:by|to)\s+([^\n\.\?\!]+)/i,
    ];

    for (const pattern of motivationPatterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 5) {
        const motivationText = 'Motivated by: ' + match[1].trim();
        detected.target_psychographics = detected.target_psychographics
          ? detected.target_psychographics + ', ' + motivationText
          : motivationText;
        break;
      }
    }
  }

  // Buying Process - Improved extraction
  if (lowerMessage.includes('decision') || lowerMessage.includes('buying') || lowerMessage.includes('purchase') ||
    lowerMessage.includes('process') || lowerMessage.includes('approve') || lowerMessage.includes('evaluation') ||
    lowerMessage.includes('criteria') || lowerMessage.includes('evaluate')) {

    // Decision makers - improved patterns
    const decisionMakerPatterns = [
      /(?:decision[- ]?makers?|decision[- ]?maker\s*roles?)[\s:]+([^\n\.\?\!]+)/i,
      /(?:who|the)\s+(?:makes|make|are|is)\s+(?:the\s+)?(?:decision|decisions)[\s:]+([^\n\.\?\!]+)/i,
      /(?:decisions?\s+(?:are|is)\s+made\s+by|decided\s+by)[\s:]+([^\n\.\?\!]+)/i,
    ];

    for (const pattern of decisionMakerPatterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 3) {
        detected.decision_makers = match[1].trim();
        break;
      }
    }

    // Buying process steps
    const processPatterns = [
      /(?:buying|purchase|sales)\s+process[\s:]+([^\n\.\?\!]+)/i,
      /(?:process|steps|workflow)\s+(?:is|are|involves?)[\s:]+([^\n\.\?\!]+)/i,
      /(?:they|customers)\s+(?:go\s+through|follow|use)\s+([^\n\.\?\!]+)/i,
    ];

    for (const pattern of processPatterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 5) {
        detected.buying_process_steps = match[1].trim();
        break;
      }
    }

    // Evaluation criteria
    const criteriaPatterns = [
      /(?:evaluation|evaluating|evaluate)\s+(?:criteria|factors?|considerations?)[\s:]+([^\n\.\?\!]+)/i,
      /(?:they|customers)\s+(?:look\s+for|consider|evaluate|judge)[\s:]+([^\n\.\?\!]+)/i,
      /(?:criteria|factors?)\s+(?:are|is|include)[\s:]+([^\n\.\?\!]+)/i,
    ];

    for (const pattern of criteriaPatterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 5) {
        detected.evaluation_criteria = match[1].trim();
        break;
      }
    }
  }

  // Budget - Improved extraction with better patterns
  if (lowerMessage.includes('budget') || lowerMessage.includes('price') || lowerMessage.includes('cost') ||
    lowerMessage.includes('spend') || lowerMessage.includes('spending') || lowerMessage.includes('afford') ||
    lowerMessage.includes('pay') || lowerMessage.includes('investment') || lowerMessage.includes('$')) {

    // Try to extract any dollar amounts or pricing mentions
    const dollarMatches = message.match(/\$[\d,]+(?:k|m)?(?:\/mo|\/month|\/year|\/yr)?/gi);
    const rangeMatches = message.match(/\$[\d,]+(?:k|m)?\s*[-–to]\s*\$[\d,]+(?:k|m)?/gi);

    if (rangeMatches && rangeMatches.length > 0) {
      detected.budget_range = rangeMatches.join(', ');
    } else if (dollarMatches && dollarMatches.length > 0) {
      // Collect all dollar amounts found
      const amounts = dollarMatches.slice(0, 5); // Limit to first 5 amounts
      detected.budget_range = amounts.join(', ');
    } else {
      // Fallback to pattern matching
      const budgetPatterns = [
        /(?:budget|spend|price|cost|spending|investment)[s]?\s*(?:is|are|of|:)?\s*\$?([\d,]+(?:\s*(?:k|thousand|million|m|K|M))?)/i,
        /(?:they|customers)\s+(?:spend|have|allocate|budget)\s+\$?([\d,]+(?:\s*(?:k|thousand|million|m|K|M))?)/i,
        /(?:around|about|approximately)\s+\$?([\d,]+(?:\s*(?:k|thousand|million|m|K|M))?)/i,
      ];

      for (const pattern of budgetPatterns) {
        const match = message.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
          const budget = match[1].trim();
          if (isValidExtractedValue(budget, 'budget')) {
            detected.budget_range = budget;
            break;
          }
        }
      }
    }
  }

  // Decision Maker Role - Improved extraction
  if (lowerMessage.includes('decision') || lowerMessage.includes('approve') || lowerMessage.includes('buyer') ||
    lowerMessage.includes('purchaser') || lowerMessage.includes('approver') || lowerMessage.includes('manager') ||
    lowerMessage.includes('director') || lowerMessage.includes('executive') || lowerMessage.includes('ceo') ||
    lowerMessage.includes('cto') || lowerMessage.includes('cfo')) {

    const decisionRolePatterns = [
      /(?:decision\s*maker|approver|buyer|purchaser)[s]?\s*(?:is|are|:)?\s*([^\n\.\?\!]+)/i,
      /(?:the|who)\s+(?:decision|approval|purchase)\s+(?:is|are)\s+(?:made\s+by|decided\s+by)[\s:]+([^\n\.\?\!]+)/i,
      /(?:role|position|title)\s+(?:is|are|:)?\s*([^\n\.\?\!]+)/i,
    ];

    for (const pattern of decisionRolePatterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 3) {
        const role = match[1].trim();
        // Validate role (not table headers like "Title Seniority")
        if (isValidExtractedValue(role, 'decision_maker_role') && role.length > 5) {
          detected.decision_maker_role = role;
          break;
        }
      }
    }

    // Approval process
    const approvalPatterns = [
      /(?:approval|approve)\s+process[\s:]+([^\n\.\?\!]+)/i,
      /(?:how|the)\s+(?:approval|approve|approving)\s+(?:works?|process|happens?)[\s:]+([^\n\.\?\!]+)/i,
    ];

    for (const pattern of approvalPatterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 5) {
        detected.approval_process = match[1].trim();
        break;
      }
    }
  }

  return detected;
}

/**
 * Check if a section is complete based on filled fields
 * 
 * Company Basics: Requires ALL 4 fields (company_name, company_size, industry, location)
 * Other sections: Requires ALL fields in that section
 */
export function checkSectionComplete(section: typeof ICP_SECTIONS[0], icpData: ICPData): boolean {
  const filledFields = section.fields.filter(field => {
    const value = icpData[field as keyof ICPData];
    return value && typeof value === 'string' && value.trim().length > 0;
  });

  // Company Basics requires ALL 4 fields to be complete
  if (section.name === 'Company Basics') {
    return filledFields.length === section.fields.length; // Must have all 4 fields
  }

  // For other sections, require ALL fields as well
  // This ensures completeness before marking section as done
  return filledFields.length === section.fields.length;
}

/**
 * Update section completion status
 */
export function updateSectionCompletion(icpData: ICPData): ICPData {
  const updated = { ...icpData };

  for (const section of ICP_SECTIONS) {
    (updated as any)[section.completeKey] = checkSectionComplete(section, icpData);
  }

  // Log completion status for debugging
  console.log('[ICP Analyzer] Section completion:', {
    company_basics: updated.company_basics_complete,
    target_customer: updated.target_customer_complete,
    problem_pain: updated.problem_pain_complete,
    buying_process: updated.buying_process_complete,
    budget_decision: updated.budget_decision_complete,
  });

  return updated;
}

