export interface ICPData {
  id?: string;
  chat_id: string;
  
  // Company Basics
  company_name?: string;
  company_size?: string;
  industry?: string;
  location?: string;
  company_basics_complete?: boolean;
  
  // Target Customer
  target_customer_type?: string;
  target_demographics?: string;
  target_psychographics?: string;
  target_customer_complete?: boolean;
  
  // Problem & Pain
  main_problems?: string;
  pain_points?: string;
  current_solutions?: string;
  problem_pain_complete?: boolean;
  
  // Buying Process
  decision_makers?: string;
  buying_process_steps?: string;
  evaluation_criteria?: string;
  buying_process_complete?: boolean;
  
  // Budget & Decision Maker
  budget_range?: string;
  decision_maker_role?: string;
  approval_process?: string;
  budget_decision_complete?: boolean;
  
  created_at?: string;
  updated_at?: string;
}

export interface ICPSection {
  name: string;
  key: keyof ICPData;
  completeKey: keyof ICPData;
  fields: string[];
}

export const ICP_SECTIONS: ICPSection[] = [
  {
    name: 'Company Basics',
    key: 'company_name',
    completeKey: 'company_basics_complete',
    fields: ['company_name', 'company_size', 'industry', 'location'],
  },
  {
    name: 'Target Customer',
    key: 'target_customer_type',
    completeKey: 'target_customer_complete',
    fields: ['target_customer_type', 'target_demographics', 'target_psychographics'],
  },
  {
    name: 'Problem & Pain',
    key: 'main_problems',
    completeKey: 'problem_pain_complete',
    fields: ['main_problems', 'pain_points', 'current_solutions'],
  },
  {
    name: 'Buying Process',
    key: 'decision_makers',
    completeKey: 'buying_process_complete',
    fields: ['decision_makers', 'buying_process_steps', 'evaluation_criteria'],
  },
  {
    name: 'Budget & Decision Maker',
    key: 'budget_range',
    completeKey: 'budget_decision_complete',
    fields: ['budget_range', 'decision_maker_role', 'approval_process'],
  },
];

/**
 * Calculate progress percentage based on completed sections
 */
export function calculateProgress(icpData: ICPData | null): number {
  if (!icpData) return 0;
  
  const sections = ICP_SECTIONS;
  let completedSections = 0;
  
  for (const section of sections) {
    const isComplete = icpData[section.completeKey] === true;
    if (isComplete) {
      completedSections++;
    }
  }
  
  return Math.round((completedSections / sections.length) * 100);
}

/**
 * Get the current section being worked on (first incomplete section)
 */
export function getCurrentSection(icpData: ICPData | null): ICPSection | null {
  if (!icpData) return ICP_SECTIONS[0];
  
  for (const section of ICP_SECTIONS) {
    if (icpData[section.completeKey] !== true) {
      return section;
    }
  }
  
  return null; // All sections complete
}

