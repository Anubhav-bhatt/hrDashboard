/**
 * Assistant Agent mode logic.
 *
 * Orchestrates recruitment AI interactions by parsing recruiter intent and delegating
 * to existing specialist capabilities (Ranking, Comparison, Screening) or controlled tools.
 *
 * Uses existing RecruitmentContext identifiers passed in request context:
 *   - jobId
 *   - candidateIds
 *   - lastRankingCandidateIds
 *   - lastComparisonCandidateIds
 *
 * Does not query Prisma directly or duplicate specialist logic.
 */
const { executeTool } = require('../tools/toolRegistry');
const { runRankingAgent } = require('./ranking.agent');
const { runComparisonAgent } = require('./comparison.agent');
const { runScreeningAgent } = require('./screening.agent');

/**
 * Parses deterministic user intent from the message.
 *
 * Supported intents:
 *   - SCREEN_CANDIDATE
 *   - RANK_CANDIDATES
 *   - COMPARE_CANDIDATES
 *   - RANK_AND_COMPARE
 *   - GENERAL_HELP
 *   - UNKNOWN
 *
 * @param {string} message
 * @returns {{ intent: string, targetCount?: number, targetCandidate?: Object }}
 */
const parseIntent = (message = '') => {
  const msg = message.trim().toLowerCase();

  // 1. HELP
  if (/\b(help|what can you|how to|capabilities|commands)\b/i.test(msg)) {
    return { intent: 'GENERAL_HELP' };
  }

  // 2. RANK AND COMPARE
  if (/\brank\b/i.test(msg) && /\bcompare\b/i.test(msg)) {
    const numMatch = msg.match(/(?:top|first)?\s*(\d+)/i);
    const targetCount = numMatch ? parseInt(numMatch[1], 10) : 3;
    return { intent: 'RANK_AND_COMPARE', targetCount };
  }

  // 3. RANK CANDIDATES
  if (/\brank\b/i.test(msg)) {
    return { intent: 'RANK_CANDIDATES' };
  }

  // 4. COMPARE CANDIDATES
  if (/\bcompare\b/i.test(msg)) {
    const numMatch = msg.match(/(?:top|first)?\s*(\d+)/i);
    let targetCount = numMatch ? parseInt(numMatch[1], 10) : 2;
    if (msg.includes('top 3') || msg.includes('three')) targetCount = 3;
    if (msg.includes('top 2') || msg.includes('two')) targetCount = 2;
    return { intent: 'COMPARE_CANDIDATES', targetCount };
  }

  // 5. SCREEN CANDIDATE
  if (/\bscreen\b/i.test(msg)) {
    let targetCandidate = null;

    if (/\b(first|1st|#1)\b/i.test(msg)) {
      targetCandidate = { position: 1 };
    } else if (/\b(second|2nd|#2)\b/i.test(msg)) {
      targetCandidate = { position: 2 };
    } else if (/\b(third|3rd|#3)\b/i.test(msg)) {
      targetCandidate = { position: 3 };
    } else {
      // Extract candidate name after "screen"
      const nameMatch = message.match(/\bscreen\s+(?:candidate\s+)?([a-z0-9\s._-]+)/i);
      if (nameMatch && nameMatch[1]) {
        const cleaned = nameMatch[1].replace(/\b(for|the|this|candidate)\b/gi, '').trim();
        if (cleaned) {
          targetCandidate = { name: cleaned };
        }
      }
    }

    return { intent: 'SCREEN_CANDIDATE', targetCandidate };
  }

  return { intent: 'UNKNOWN' };
};

const buildAssistantResponse = ({
  intent,
  status = 'SUCCESS',
  message,
  jobId = null,
  candidateIds = [],
  specialistMode = null,
  result = null,
  suggestedActions = [],
  warnings = []
}) => ({
  content: message,
  structuredData: {
    intent,
    status,
    message,
    jobId,
    candidateIds,
    specialistMode,
    result,
    suggestedActions,
    warnings
  },
  provider: 'mock',
  model: 'mock-v1'
});

const buildClarificationResponse = ({ intent, message, suggestedActions = [] }) =>
  buildAssistantResponse({
    intent,
    status: 'CLARIFICATION_REQUIRED',
    message,
    suggestedActions
  });

const buildUnavailableResponse = (featureName, intent) =>
  buildAssistantResponse({
    intent,
    status: 'UNAVAILABLE',
    message: `${featureName} capability is currently disabled in system configuration.`,
    suggestedActions: []
  });

const buildHelpResponse = (config) => {
  const modes = config?.modes || {};
  const lines = [
    'I am your AI Recruitment Assistant. I can help you orchestrate candidate evaluation for your roles:\n',
    modes.ranking ? '• **Rank candidates** — order candidate pool by fit: *"Rank candidates"*' : null,
    modes.comparison ? '• **Compare candidates** — side-by-side trade-off analysis: *"Compare top 2"*' : null,
    modes.screening ? '• **Screen a candidate** — detailed requirement evaluation: *"Screen Rahul"*' : null,
    modes.ranking && modes.comparison ? '• **Rank & Compare** — sequence both tasks: *"Rank candidates and compare top 3"*' : null
  ].filter(Boolean);

  return buildAssistantResponse({
    intent: 'GENERAL_HELP',
    status: 'SUCCESS',
    message: lines.join('\n'),
    suggestedActions: [
      { label: 'Rank candidates', action: 'rank_candidates', mode: 'ranking' },
      { label: 'Compare top 2', action: 'compare_top_2', mode: 'comparison' }
    ]
  });
};

const resolveCandidatesForComparison = (context, targetCount = 2, jobData) => {
  const count = targetCount > 0 ? targetCount : 2;

  if (Array.isArray(context.candidateIds) && context.candidateIds.length >= 2) {
    return context.candidateIds.slice(0, count);
  }
  if (Array.isArray(context.lastRankingCandidateIds) && context.lastRankingCandidateIds.length >= 2) {
    return context.lastRankingCandidateIds.slice(0, count);
  }
  if (Array.isArray(context.lastComparisonCandidateIds) && context.lastComparisonCandidateIds.length >= 2) {
    return context.lastComparisonCandidateIds.slice(0, count);
  }

  return [];
};

const validateCandidatesInJob = async (candidateIds, jobId, toolRunner, context, config) => {
  const valid = [];
  for (const cid of candidateIds) {
    try {
      const res = await toolRunner('getCandidate', { candidateId: cid, jobId }, context, { config });
      if (res.success && res.data?.candidate) {
        const cand = res.data.candidate;
        if (!cand.jobId || cand.jobId === jobId) {
          valid.push(cid);
        }
      }
    } catch {
      // Ignored: invalid candidate ID is dropped
    }
  }
  return valid;
};

const resolveCandidateForScreening = async (targetCandidate, context, jobId, toolRunner, config) => {
  if (targetCandidate?.position) {
    const pos = targetCandidate.position - 1;
    const fromComp = context.lastComparisonCandidateIds?.[pos];
    const fromRank = context.lastRankingCandidateIds?.[pos];
    const fromSel = context.candidateIds?.[pos];
    const resolvedId = fromComp || fromRank || fromSel;
    if (resolvedId) {
      return { status: 'FOUND', candidateId: resolvedId };
    }
  }

  if (targetCandidate?.name) {
    const searchName = targetCandidate.name.trim().toLowerCase();
    const searchRes = await toolRunner('getCandidates', { jobId, limit: 100 }, context, { config });
    if (searchRes.success && Array.isArray(searchRes.data?.candidates)) {
      const candidates = searchRes.data.candidates;
      const matches = candidates.filter((c) => (c.name || '').toLowerCase().includes(searchName));
      if (matches.length === 1) {
        return { status: 'FOUND', candidateId: matches[0].candidateId };
      }
      if (matches.length > 1) {
        return { status: 'AMBIGUOUS', candidates: matches };
      }
      return { status: 'NOT_FOUND' };
    }
  }

  // Fallback to first available context candidate
  const fallbackId =
    context.lastComparisonCandidateIds?.[0] ||
    context.lastRankingCandidateIds?.[0] ||
    context.candidateIds?.[0];

  if (fallbackId) {
    return { status: 'FOUND', candidateId: fallbackId };
  }

  return { status: 'NO_CANDIDATE' };
};

/**
 * Executes the Assistant orchestration turn.
 *
 * @param {Object} params
 * @param {string} params.message
 * @param {import('../types/ai.types').AgentContext} params.context
 * @param {import('../providers/AIProvider').AIProvider} params.provider
 * @param {Object} [params.config]
 * @param {Function} [params.toolRunner] Injectable for tests
 */
const runAssistantAgent = async ({
  message,
  context = {},
  provider,
  config,
  toolRunner = executeTool
}) => {
  const parsed = parseIntent(message);
  const jobId = context.jobId || null;
  const activeModes = config?.modes || {};

  if (parsed.intent === 'GENERAL_HELP') {
    return buildHelpResponse(config);
  }

  // Missing Job Context
  if (!jobId && ['RANK_CANDIDATES', 'COMPARE_CANDIDATES', 'RANK_AND_COMPARE', 'SCREEN_CANDIDATE'].includes(parsed.intent)) {
    return buildClarificationResponse({
      intent: parsed.intent,
      message: 'Choose a job or run Ranking first so I know which candidates to work with.',
      suggestedActions: [
        { label: 'Select a job from Jobs page', action: 'navigate_jobs', to: '/jobs' }
      ]
    });
  }

  // Retrieve Job Details if jobId is present
  let jobData = null;
  if (jobId) {
    const jobResult = await toolRunner('getJob', { jobId }, context, { config });
    if (!jobResult.success) {
      return buildClarificationResponse({
        intent: parsed.intent,
        message: 'Job not found. Please select a valid active job.',
        suggestedActions: []
      });
    }
    jobData = jobResult.data.job;
  }

  // Closed Job Safety
  if (jobData && jobData.status === 'CLOSED') {
    if (parsed.intent === 'RANK_CANDIDATES' || parsed.intent === 'RANK_AND_COMPARE') {
      return buildAssistantResponse({
        intent: parsed.intent,
        status: 'RESTRICTED',
        message: `This job (${jobData.title}) is closed. Active candidate ranking is unavailable for closed jobs.`,
        jobId,
        specialistMode: null,
        suggestedActions: [
          { label: 'View closed job details', action: 'view_job', to: `/jobs/${jobId}` }
        ]
      });
    }
  }

  switch (parsed.intent) {
    case 'RANK_CANDIDATES': {
      if (!activeModes.ranking) {
        return buildUnavailableResponse('Ranking', parsed.intent);
      }

      const rankingResult = await runRankingAgent({
        message,
        context: {
          jobId,
          candidateScope: context.candidateScope || 'ALL',
          filters: context.filters
        },
        provider,
        config,
        toolRunner
      });

      const structured = rankingResult.structuredData || {};
      const rankedList = structured.rankedCandidates || [];
      const rankedIds = rankedList.map((c) => c.candidateId).filter(Boolean);

      const topSummary = rankedList
        .slice(0, 3)
        .map((c, i) => `${i + 1}. **${c.candidateName}** (${c.matchScore !== null ? c.matchScore + '%' : 'unscored'} match)`)
        .join('\n');

      const text = `Ranking complete for **${jobData.title}** (${structured.totalCandidatesConsidered || rankedList.length} candidates considered).\n\nTop candidates:\n${topSummary}`;

      const suggestedActions = [
        { label: 'View full ranking', action: 'view_ranking', to: `/ai/ranking?jobId=${jobId}` }
      ];
      if (rankedIds.length >= 2) {
        suggestedActions.push({
          label: 'Compare top 2',
          action: 'compare_candidates',
          mode: 'comparison',
          candidateIds: rankedIds.slice(0, 2)
        });
      }
      if (rankedIds.length >= 3) {
        suggestedActions.push({
          label: 'Compare top 3',
          action: 'compare_candidates',
          mode: 'comparison',
          candidateIds: rankedIds.slice(0, 3)
        });
      }
      if (rankedList.length >= 1) {
        suggestedActions.push({
          label: `Screen ${rankedList[0].candidateName}`,
          action: 'screen_candidate',
          mode: 'screening',
          candidateId: rankedIds[0]
        });
      }

      return buildAssistantResponse({
        intent: 'RANK_CANDIDATES',
        status: 'SUCCESS',
        message: text,
        jobId,
        candidateIds: rankedIds,
        specialistMode: 'ranking',
        result: structured,
        suggestedActions,
        warnings: structured.warnings || []
      });
    }

    case 'COMPARE_CANDIDATES': {
      if (!activeModes.comparison) {
        return buildUnavailableResponse('Comparison', parsed.intent);
      }

      let targetIds = resolveCandidatesForComparison(context, parsed.targetCount, jobData);
      if (targetIds.length < 2) {
        const candResult = await toolRunner('getCandidates', { jobId, limit: 10 }, context, { config });
        if (candResult.success && Array.isArray(candResult.data?.candidates) && candResult.data.candidates.length >= 2) {
          targetIds = candResult.data.candidates.slice(0, parsed.targetCount || 2).map((c) => c.candidateId);
        }
      }

      if (targetIds.length < 2) {
        return buildClarificationResponse({
          intent: 'COMPARE_CANDIDATES',
          message: 'Choose a job or run Ranking first so I know which candidates to compare.',
          suggestedActions: [
            { label: 'Rank candidates first', action: 'rank_candidates', mode: 'ranking' }
          ]
        });
      }

      const validIds = await validateCandidatesInJob(targetIds, jobId, toolRunner, context, config);
      if (validIds.length < 2) {
        return buildClarificationResponse({
          intent: 'COMPARE_CANDIDATES',
          message: 'Choose a job or run Ranking first so I know which candidates to compare.',
          suggestedActions: [
            { label: 'Rank candidates', action: 'rank_candidates', mode: 'ranking' }
          ]
        });
      }

      const compResult = await runComparisonAgent({
        message,
        context: {
          jobId,
          candidateIds: validIds
        },
        provider,
        config,
        toolRunner
      });

      const structured = compResult.structuredData || {};
      const comparedCands = structured.candidates || [];
      const candNames = comparedCands.map((c) => c.candidateName).join(' and ');
      const tradeoffs = structured.tradeoffs || [];

      const text = `Compared **${candNames}** for **${jobData.title}**.\n\nKey Trade-offs:\n${tradeoffs.map((t) => `• ${t}`).join('\n')}`;

      const suggestedActions = [
        { label: 'View full comparison', action: 'view_comparison', to: `/ai/comparison?jobId=${jobId}&candidateIds=${validIds.join(',')}` }
      ];
      for (const cand of comparedCands) {
        suggestedActions.push({
          label: `Screen ${cand.candidateName}`,
          action: 'screen_candidate',
          mode: 'screening',
          candidateId: cand.candidateId
        });
      }

      return buildAssistantResponse({
        intent: 'COMPARE_CANDIDATES',
        status: 'SUCCESS',
        message: text,
        jobId,
        candidateIds: validIds,
        specialistMode: 'comparison',
        result: structured,
        suggestedActions,
        warnings: structured.warnings || []
      });
    }

    case 'RANK_AND_COMPARE': {
      if (!activeModes.ranking) {
        return buildUnavailableResponse('Ranking', parsed.intent);
      }
      if (!activeModes.comparison) {
        return buildUnavailableResponse('Comparison', parsed.intent);
      }

      const rankingResult = await runRankingAgent({
        message: 'Rank candidate pool',
        context: {
          jobId,
          candidateScope: context.candidateScope || 'ALL'
        },
        provider,
        config,
        toolRunner
      });

      const rankStructured = rankingResult.structuredData || {};
      const rankedList = rankStructured.rankedCandidates || [];
      const rankedIds = rankedList.map((c) => c.candidateId).filter(Boolean);

      if (rankedIds.length < 2) {
        return buildAssistantResponse({
          intent: 'RANK_AND_COMPARE',
          status: 'INSUFFICIENT_DATA',
          message: `Ranking completed for **${jobData.title}**, but only ${rankedIds.length} candidate was found. At least 2 candidates are required for Comparison.`,
          jobId,
          candidateIds: rankedIds,
          specialistMode: 'ranking',
          result: rankStructured,
          suggestedActions: [
            { label: 'View full ranking', action: 'view_ranking', to: `/ai/ranking?jobId=${jobId}` }
          ]
        });
      }

      const topCount = Math.min(parsed.targetCount || 3, rankedIds.length);
      const topIds = rankedIds.slice(0, topCount);

      const compResult = await runComparisonAgent({
        message: `Compare top ${topCount}`,
        context: {
          jobId,
          candidateIds: topIds
        },
        provider,
        config,
        toolRunner
      });

      const compStructured = compResult.structuredData || {};
      const comparedCands = compStructured.candidates || [];
      const candNames = comparedCands.map((c) => c.candidateName).join(', ');
      const tradeoffs = compStructured.tradeoffs || [];

      const text = `Ranked candidates for **${jobData.title}** and compared the top ${topCount} (**${candNames}**).\n\nKey Trade-offs:\n${tradeoffs.map((t) => `• ${t}`).join('\n')}`;

      const suggestedActions = [
        { label: 'View full comparison', action: 'view_comparison', to: `/ai/comparison?jobId=${jobId}&candidateIds=${topIds.join(',')}` },
        { label: 'View full ranking', action: 'view_ranking', to: `/ai/ranking?jobId=${jobId}` }
      ];
      if (comparedCands.length > 0) {
        suggestedActions.push({
          label: `Screen ${comparedCands[0].candidateName}`,
          action: 'screen_candidate',
          mode: 'screening',
          candidateId: comparedCands[0].candidateId
        });
      }

      return buildAssistantResponse({
        intent: 'RANK_AND_COMPARE',
        status: 'SUCCESS',
        message: text,
        jobId,
        candidateIds: topIds,
        specialistMode: 'comparison',
        result: {
          ranking: rankStructured,
          comparison: compStructured
        },
        suggestedActions,
        warnings: [...(rankStructured.warnings || []), ...(compStructured.warnings || [])]
      });
    }

    case 'SCREEN_CANDIDATE': {
      if (!activeModes.screening) {
        return buildUnavailableResponse('Screening', parsed.intent);
      }

      const resolution = await resolveCandidateForScreening(parsed.targetCandidate, context, jobId, toolRunner, config);

      if (resolution.status === 'AMBIGUOUS') {
        return buildAssistantResponse({
          intent: 'SCREEN_CANDIDATE',
          status: 'CLARIFICATION_REQUIRED',
          message: `Multiple candidates match "${parsed.targetCandidate?.name}": ${resolution.candidates.map((c) => c.name).join(', ')}. Which candidate would you like to screen?`,
          jobId,
          specialistMode: null,
          suggestedActions: resolution.candidates.map((c) => ({
            label: `Screen ${c.name}`,
            action: 'screen_specific',
            mode: 'screening',
            candidateId: c.candidateId
          }))
        });
      }

      if (resolution.status === 'NOT_FOUND') {
        return buildAssistantResponse({
          intent: 'SCREEN_CANDIDATE',
          status: 'NOT_FOUND',
          message: `Candidate "${parsed.targetCandidate?.name || 'specified'}" was not found for **${jobData.title}**.`,
          jobId,
          specialistMode: null,
          suggestedActions: [
            { label: 'Rank candidates', action: 'rank_candidates', mode: 'ranking' }
          ]
        });
      }

      if (resolution.status === 'NO_CANDIDATE') {
        return buildClarificationResponse({
          intent: 'SCREEN_CANDIDATE',
          message: 'Which candidate would you like to screen? Run Ranking or choose a candidate first.',
          suggestedActions: [
            { label: 'Rank candidates first', action: 'rank_candidates', mode: 'ranking' }
          ]
        });
      }

      const targetCandidateId = resolution.candidateId;

      const screenResult = await runScreeningAgent({
        message,
        context: {
          jobId,
          candidateIds: [targetCandidateId]
        },
        provider,
        config,
        toolRunner
      });

      const structured = screenResult.structuredData || {};
      const summaryText = structured.summary || `Screening completed for ${structured.candidateName || 'candidate'}.`;

      const text = `Screening summary for **${structured.candidateName}** (${jobData.title}):\n\n${summaryText}\n\n**Fit Level:** ${structured.fitLevel}\n**Recommendation:** ${structured.recommendation}`;

      const suggestedActions = [
        { label: 'View full screening', action: 'view_screening', to: `/ai/screening?jobId=${jobId}&candidateId=${targetCandidateId}` },
        { label: 'Back to comparison', action: 'back_comparison', to: `/ai/comparison?jobId=${jobId}` }
      ];

      return buildAssistantResponse({
        intent: 'SCREEN_CANDIDATE',
        status: 'SUCCESS',
        message: text,
        jobId,
        candidateIds: [targetCandidateId],
        specialistMode: 'screening',
        result: structured,
        suggestedActions,
        warnings: structured.dataWarnings || []
      });
    }

    default: {
      return buildAssistantResponse({
        intent: 'UNKNOWN',
        status: 'UNKNOWN_INTENT',
        message: "I didn't quite catch that. You can ask me to rank candidates, compare top candidates, or screen a specific candidate for your active role.",
        jobId,
        specialistMode: null,
        suggestedActions: [
          { label: 'Rank candidates', action: 'rank_candidates', mode: 'ranking' },
          { label: 'What can you help me with?', action: 'general_help' }
        ]
      });
    }
  }
};

module.exports = {
  runAssistantAgent,
  parseIntent
};
