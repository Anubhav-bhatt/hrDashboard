/**
 * Presentation language mappings for task-first recruiter experience.
 *
 * Keeps backend identifiers, agent modes, and API contracts unchanged while
 * presenting intuitive, task-driven terminology in the user interface.
 */

export const TASK_TERMINOLOGY = Object.freeze({
  // AI Specialist presentation names
  rankingAgent: 'Find Best Matches',
  comparisonAgent: 'Compare Candidates',
  screeningAgent: 'Screen Candidate',
  insightsAgent: 'Hiring Insights',
  assistantAgent: 'AI Assistant',

  // Recruitment Journey Stages
  journeyStages: {
    jobCreated: 'Job Created',
    candidatesAdded: 'Add Candidates',
    reviewMatches: 'Review Matches',
    shortlist: 'Shortlist',
    select: 'Select Candidate',
    closeJob: 'Close Job'
  },

  // Common Action labels
  actions: {
    findBestMatches: 'Find Best Matches',
    compareCandidates: 'Compare Candidates',
    screenCandidate: 'Screen Candidate',
    viewInsights: 'View Hiring Insights',
    askAssistant: 'Ask Assistant',
    addCandidates: 'Add Candidates',
    createJob: 'Create Job'
  }
});

export const getAgentTaskLabel = (modeId) => {
  switch (modeId) {
    case 'ranking':
      return TASK_TERMINOLOGY.rankingAgent;
    case 'comparison':
      return TASK_TERMINOLOGY.comparisonAgent;
    case 'screening':
      return TASK_TERMINOLOGY.screeningAgent;
    case 'insights':
      return TASK_TERMINOLOGY.insightsAgent;
    case 'assistant':
    default:
      return TASK_TERMINOLOGY.assistantAgent;
  }
};
