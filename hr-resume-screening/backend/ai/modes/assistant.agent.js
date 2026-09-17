/**
 * Assistant Agent mode logic.
 *
 * Orchestrates recruitment AI interactions by parsing recruiter intent and delegating
 * to existing specialist capabilities (Ranking, Comparison, Screening, Insights) or controlled tools.
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
const { runInsightsAgent } = require('./insights.agent');
const { logShadowRun } = require('../logging/shadowLogger');
const { validateAssistantIntent } = require('../providers/schemas/assistantIntent.schema');

/**
 * Builds the context a delegated specialist runs under.
 *
 * A specialist reaches data through the same tool layer as a direct call, and
 * that layer resolves permissions from `userId` and `userRole`. Those fields are
 * put on the context by `AgentContext` from the verified session and can never
 * be supplied by a client, so carrying them across the hand-off is what makes a
 * delegated read behave exactly like the same read requested directly. Omitting
 * them granted the specialist nothing at all, and its first tool call failed
 * with "jobs.read required" while the direct call succeeded.
 *
 * Only the server-owned fields travel. The specialist's data inputs — jobId,
 * candidateIds, candidateScope, filters — come from `overrides`, i.e. from the
 * branch that decided to delegate, not from whatever the caller happened to
 * have in context. That distinction matters: `ranking.agent` reads
 * `filters.candidateScope` ahead of `candidateScope`, so spreading the whole
 * incoming context would let a stale filter in the browser silently change what
 * the assistant ranks.
 *
 * @param {import('../types/ai.types').AgentContext} context Authenticated context
 * @param {Object} overrides Specialist inputs chosen by the delegating branch
 * @returns {Object} Context for the specialist
 */
const delegateContext = (context, overrides) => ({
  requestId: context.requestId,
  userId: context.userId,
  userRole: context.userRole,
  ...overrides
});

/**
 * Parses deterministic user intent from the message.
 *
 * Supported intents:
 *   - SCREEN_CANDIDATE
 *   - RANK_CANDIDATES
 *   - COMPARE_CANDIDATES
 *   - RANK_AND_COMPARE
 *   - GET_INSIGHTS
 *   - SAFETY_WRITE_ATTEMPT
 *   - SAFETY_PROTECTED_TRAIT
 *   - GENERAL_HELP
 *   - UNKNOWN
 *
 * @param {string} message
 * @returns {{ intent: string, targetCount?: number, targetCandidate?: Object, requiresJobContext?: boolean }}
 */
const parseIntent = (message = '') => {
  const msg = message.trim().toLowerCase();

  // 1. SAFETY: Prohibited write actions (including injection / override attempts)
  if (
    /\b(shortlist\s+[a-z0-9\s._-]+|select\s+[a-z0-9\s._-]+|hire\s+[a-z0-9\s._-]+|close\s+(?:the\s+|this\s+)?(?:job|opening|role)|delete\s+(?:the\s+|this\s+)?(?:job|role)|reject\s+(?:all|low|everyone|candidates))\b/i.test(
      msg
    ) &&
    !/\b(how|what|view|review|show|summary|compare|screen|rank)\b/i.test(msg)
  ) {
    return { intent: 'SAFETY_WRITE_ATTEMPT' };
  }

  // 2. SAFETY: Prohibited protected attribute ranking / filtering
  if (
    /\b(?:by|based\s+on|prefer|filter\s+by)\s+(?:age|younger|older|gender|sex|male|female|men|women|race|religion|caste|marital\s+status|ethnicity|sexual\s+orientation)\b/i.test(
      msg
    ) ||
    /\b(?:younger|older|male\s+applicants|religion|caste|married\s+candidates|filter\s+by\s+race)\b/i.test(msg)
  ) {
    return { intent: 'SAFETY_PROTECTED_TRAIT' };
  }

  // 3. HELP
  if (/\b(help|what can you|how to|capabilities|commands)\b/i.test(msg)) {
    return { intent: 'GENERAL_HELP' };
  }

  // 4. INSIGHTS
  if (
    /\b(insights?|insghts|atenttion|pulse|needs?\s+(?:my\s+)?attention|what\s+should\s+i\s+focus\s+on|how\s+is\s+(?:this|the)\s+job\s+doing|how's\s+this\s+(?:position|role|job)\s+looking|pipeline\s+health|hiring\s+(?:performance|pulse))\b/i.test(
      msg
    )
  ) {
    const requiresJobContext = /\b(this\s+job|for\s+this\s+role|how\s+is\s+this\s+job\s+doing|how's\s+this\s+(?:position|role|job)\s+looking)\b/i.test(msg);
    return { intent: 'GET_INSIGHTS', requiresJobContext };
  }

  // 5. RANK AND COMPARE
  if (/\brank\b/i.test(msg) && /\b(?:compare|compair|comapre)\b/i.test(msg)) {
    const numMatch = msg.match(/(?:top|first)?\s*(\d+)/i);
    const targetCount = numMatch ? parseInt(numMatch[1], 10) : 3;
    return { intent: 'RANK_AND_COMPARE', targetCount };
  }

  // 6. RANK CANDIDATES
  if (
    /\b(rank|who\s+looks?\s+(?:best|strongest)|who\s+stands?\s+out|who\s+should\s+i\s+look\s+at\s+first|best\s+match(?:es)?|top\s+matches|give\s+me\s+the\s+strongest|canddiates|candiadtes|aplicants|strong\s+experience|who\s+is\s+best\s+match)\b/i.test(
      msg
    )
  ) {
    return { intent: 'RANK_CANDIDATES' };
  }

  // 7. COMPARE CANDIDATES
  if (/\b(compare|compair|comapre|put\s+side\s+by\s+side|side\s+by\s+side)\b/i.test(msg)) {
    const numMatch = msg.match(/(?:top|first|strongest)?\s*(\d+)/i);
    let targetCount = numMatch ? parseInt(numMatch[1], 10) : 2;
    if (msg.includes('top 3') || msg.includes('three') || msg.includes('strongest three') || msg.includes('top tree')) targetCount = 3;
    if (msg.includes('top 2') || msg.includes('two') || msg.includes('strongest two')) targetCount = 2;
    return { intent: 'COMPARE_CANDIDATES', targetCount };
  }

  // 8. SCREEN CANDIDATE
  if (/\b(screen|scren|scern|evaluate|check|how\s+does|scores?|fit\s+this\s+role)\b/i.test(msg)) {
    let targetCandidate = null;

    if (/\b(first|1st|#1)\b/i.test(msg)) {
      targetCandidate = { position: 1 };
    } else if (/\b(second|2nd|#2)\b/i.test(msg)) {
      targetCandidate = { position: 2 };
    } else if (/\b(third|3rd|#3)\b/i.test(msg)) {
      targetCandidate = { position: 3 };
    } else {
      // Extract candidate name after "screen", "scren", "scern", "evaluate", "check", "how does", or "scores"
      let nameMatch = message.match(/\b(?:screen|scren|scern|evaluate)\s+(?:candidate\s+)?([a-z0-9\s._-]+)/i);
      if (!nameMatch) {
        nameMatch = message.match(/\bcheck\s+([a-z0-9\s._-]+?)\s+(?:against|for)\b/i);
      }
      if (!nameMatch) {
        nameMatch = message.match(/\bhow\s+does\s+([a-z0-9\s._-]+?)\s+fit\b/i);
      }
      if (!nameMatch) {
        nameMatch = message.match(/\bhow\s+([a-z0-9\s._-]+?)\s+scores\b/i);
      }
      if (nameMatch && nameMatch[1]) {
        const cleaned = nameMatch[1].replace(/\b(for|the|this|candidate)\b/gi, '').trim();
        if (cleaned) {
          targetCandidate = { name: cleaned };
        }
      }
    }

    if (targetCandidate || /\b(screen|scren|scern)\b/i.test(msg)) {
      return { intent: 'SCREEN_CANDIDATE', targetCandidate };
    }
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
    specialistMode: null,
    suggestedActions
  });

const buildRestrictedResponse = (reason, intent) =>
  buildAssistantResponse({
    intent,
    status: 'RESTRICTED',
    message: reason,
    specialistMode: null,
    suggestedActions: [
      { label: 'View job overview', action: 'view_job', to: '/jobs' }
    ]
  });

const buildUnavailableResponse = (capabilityName, intent) =>
  buildAssistantResponse({
    intent,
    status: 'UNAVAILABLE',
    message: `${capabilityName} capability is currently disabled in your workspace configuration.`,
    specialistMode: null,
    suggestedActions: [
      { label: 'View jobs', action: 'navigate_jobs', to: '/jobs' }
    ]
  });

/**
 * Resolves candidates for comparison based on priority hierarchy.
 */
const resolveCandidatesForComparison = (context, targetCount = 2, jobData = null) => {
  if (Array.isArray(context.candidateIds) && context.candidateIds.length >= 2) {
    return context.candidateIds.slice(0, targetCount);
  }
  if (Array.isArray(context.lastRankingCandidateIds) && context.lastRankingCandidateIds.length >= 2) {
    return context.lastRankingCandidateIds.slice(0, targetCount);
  }
  if (Array.isArray(context.lastComparisonCandidateIds) && context.lastComparisonCandidateIds.length >= 2) {
    return context.lastComparisonCandidateIds.slice(0, targetCount);
  }
  return [];
};

/**
 * Resolves candidate for screening from target candidate description or context fallback.
 */
const resolveCandidateForScreening = async (
  targetCandidate,
  context,
  jobId,
  toolRunner
) => {
  if (targetCandidate?.position) {
    const pos = targetCandidate.position - 1;
    if (context.lastComparisonCandidateIds && context.lastComparisonCandidateIds[pos]) {
      return { status: 'FOUND', candidateId: context.lastComparisonCandidateIds[pos] };
    }
    if (context.lastRankingCandidateIds && context.lastRankingCandidateIds[pos]) {
      return { status: 'FOUND', candidateId: context.lastRankingCandidateIds[pos] };
    }
    if (context.candidateIds && context.candidateIds[pos]) {
      return { status: 'FOUND', candidateId: context.candidateIds[pos] };
    }
  }

  if (targetCandidate?.name) {
    const searchName = targetCandidate.name.trim().toLowerCase();
    const searchRes = await toolRunner('getCandidates', { jobId, limit: 100 }, context);
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

  const fallbackId =
    context.lastComparisonCandidateIds?.[0] ||
    context.lastRankingCandidateIds?.[0] ||
    context.candidateIds?.[0];

  if (fallbackId) {
    return { status: 'FOUND', candidateId: fallbackId };
  }

  return { status: 'UNRESOLVED' };
};

/**
 * Validates that candidate IDs belong to the current job.
 */
const validateCandidatesInJob = async (candidateIds, jobId, toolRunner, context, config) => {
  const verified = [];
  for (const cid of candidateIds) {
    try {
      const res = await toolRunner('getCandidate', { candidateId: cid }, context, { config });
      if (res.success && res.data?.candidate?.jobId === jobId) {
        verified.push(cid);
      }
    } catch {
      // Ignore not found
    }
  }
  return verified;
};

/**
 * Executes unified Assistant Agent orchestration.
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
  const detParsed = parseIntent(message);
  const activeModes = config?.modes || {
    assistant: true,
    screening: true,
    ranking: true,
    comparison: true,
    insights: true
  };

  // 1. SAFETY PRE-CHECK: Prohibited write actions (0 provider calls)
  if (detParsed.intent === 'SAFETY_WRITE_ATTEMPT') {
    return buildAssistantResponse({
      intent: 'SAFETY_WRITE_ATTEMPT',
      status: 'SAFETY_REFUSAL',
      message:
        'AI Assistant is strictly read-only and does not perform autonomous recruitment actions (such as shortlisting, selecting candidates, closing jobs, or deleting records). Please perform this confirmed action directly on the job or candidate page.',
      jobId: context.jobId || null,
      specialistMode: null,
      suggestedActions: [
        { label: 'View job overview', action: 'view_job', to: context.jobId ? `/jobs/${context.jobId}` : '/jobs' }
      ]
    });
  }

  // 2. SAFETY PRE-CHECK: Prohibited protected attribute ranking (0 provider calls)
  if (detParsed.intent === 'SAFETY_PROTECTED_TRAIT') {
    return buildAssistantResponse({
      intent: 'SAFETY_PROTECTED_TRAIT',
      status: 'SAFETY_REFUSAL',
      message:
        'Evaluation and ranking must be based exclusively on documented job requirements, skills, and qualifications. Protected personal characteristics (such as age, gender, race, religion) are not used for candidate evaluation.',
      jobId: context.jobId || null,
      specialistMode: null,
      suggestedActions: [
        { label: 'Rank by job requirements', action: 'rank_candidates', mode: 'ranking' }
      ]
    });
  }

  let parsed = detParsed;

  // 3. SHADOW MODE: Evaluate provider in shadow, log telemetry, keep deterministic authoritative
  if (config?.providerMode === 'shadow' && provider && typeof provider.run === 'function') {
    try {
      const startMs = Date.now();
      const providerRes = await provider.run({ mode: 'assistant', message, context });
      const latencyMs = Date.now() - startMs;
      const provIntent = providerRes?.structuredData?.intent || 'UNKNOWN';
      logShadowRun({
        provider: provider.name,
        mode: 'shadow',
        deterministicIntent: detParsed.intent,
        providerIntent: provIntent,
        agreed: detParsed.intent === provIntent,
        latencyMs,
        success: true
      });
    } catch (err) {
      logShadowRun({
        provider: provider.name,
        mode: 'shadow',
        deterministicIntent: detParsed.intent,
        providerIntent: 'ERROR',
        agreed: false,
        latencyMs: 0,
        success: false,
        errorCode: err.code || err.name || 'PROVIDER_ERROR'
      });
    }
    parsed = detParsed;
  } else if (
    config?.providerMode === 'live' &&
    config?.realProviderEnabled &&
    provider &&
    typeof provider.run === 'function'
  ) {
    // 4. LIVE MODE: Provider interpretation drives intent with deterministic fallback
    try {
      const providerRes = await provider.run({ mode: 'assistant', message, context });
      const validated = validateAssistantIntent(providerRes?.structuredData);
      if (validated.valid && validated.data.intent && validated.data.intent !== 'UNKNOWN') {
        parsed = {
          intent: validated.data.intent,
          targetCount: validated.data.candidateCount || detParsed.targetCount,
          candidateCount: validated.data.candidateCount || detParsed.candidateCount,
          candidateName: validated.data.candidateName || detParsed.candidateName,
          targetCandidate: validated.data.candidateName
            ? { name: validated.data.candidateName }
            : validated.data.candidateReference
              ? {
                  position:
                    validated.data.candidateReference === 'FIRST'
                      ? 1
                      : validated.data.candidateReference === 'SECOND'
                        ? 2
                        : 3
                }
              : detParsed.targetCandidate,
          candidateReference: validated.data.candidateReference || detParsed.candidateReference,
          requiresJobContext: validated.data.requiresJobContext || detParsed.requiresJobContext,
          rawScope: validated.data.scope || detParsed.rawScope
        };
      }
    } catch {
      // Safe fallback to deterministic router on provider failure (timeout, rate limit, invalid response)
      parsed = detParsed;
    }
  }

  // 5. HELP
  if (parsed.intent === 'GENERAL_HELP') {
    return buildAssistantResponse({
      intent: 'GENERAL_HELP',
      status: 'SUCCESS',
      message:
        "Here is what I can help you with:\n\n" +
        "• **Rank candidates**: Order your active applicants by match score and mandatory requirement fit.\n" +
        "• **Compare candidates**: Put top candidates side-by-side to review trade-offs and dimension breakdowns.\n" +
        "• **Screen candidate**: Evaluate a specific candidate's evidence, skills, and fit level against job criteria.\n" +
        "• **Recruitment Insights**: Review pipeline health, bottleneck warnings, and recommended next actions.\n\n" +
        "Try asking: *\"Rank candidates\"*, *\"Compare top 3\"*, *\"Screen Rahul Sharma\"*, or *\"Show insights\"*.",
      jobId: context.jobId || null,
      specialistMode: null,
      suggestedActions: [
        { label: 'Rank candidates', action: 'rank_candidates', mode: 'ranking' },
        { label: 'Show recruitment insights', action: 'show_insights', mode: 'insights' }
      ]
    });
  }

  // 4. INSIGHTS INTENT
  if (parsed.intent === 'GET_INSIGHTS') {
    if (!activeModes.insights) {
      return buildUnavailableResponse('Insights', parsed.intent);
    }

    if (parsed.requiresJobContext && !context.jobId) {
      return buildClarificationResponse({
        intent: 'GET_INSIGHTS',
        message: 'Choose a job first so I know which role’s insights to analyze.',
        suggestedActions: [
          { label: 'Select a job from Jobs page', action: 'navigate_jobs', to: '/jobs' },
          { label: 'Show workspace overview insights', action: 'global_insights' }
        ]
      });
    }

    const insightsResult = await runInsightsAgent({
      message,
      context,
      provider,
      config,
      toolRunner
    });

    const structured = insightsResult.structuredData || {};
    const suggestedActions = [
      { label: 'Open Insights', action: 'open_insights', to: '/ai/insights' }
    ];

    if (structured.insights && structured.insights.length > 0) {
      const topAction = structured.insights[0];
      if (topAction.to && topAction.actionLabel) {
        suggestedActions.unshift({
          label: topAction.actionLabel,
          action: topAction.recommendedAction || 'recommended_action',
          to: topAction.to
        });
      }
    }

    return buildAssistantResponse({
      intent: 'GET_INSIGHTS',
      status: 'SUCCESS',
      message: insightsResult.content,
      jobId: context.jobId || null,
      specialistMode: 'insights',
      result: structured,
      suggestedActions,
      warnings: structured.warnings || []
    });
  }

  // 5. REQUIRE JOB FOR SPECIALISTS (Ranking, Comparison, Screening)
  const jobId = context.jobId;
  if (!jobId) {
    return buildClarificationResponse({
      intent: parsed.intent,
      message: 'Choose a job or run Ranking first so I know which candidates to work with.',
      suggestedActions: [
        { label: 'Select a job from Jobs page', action: 'navigate_jobs', to: '/jobs' }
      ]
    });
  }

  // Fetch job details to check status and title
  const jobResult = await toolRunner('getJob', { jobId }, context, { config });
  if (!jobResult.success || !jobResult.data?.job) {
    return buildAssistantResponse({
      intent: parsed.intent,
      status: 'NOT_FOUND',
      message: `Job "${jobId}" was not found or has been deleted.`,
      jobId,
      specialistMode: null,
      suggestedActions: [{ label: 'View all jobs', action: 'navigate_jobs', to: '/jobs' }]
    });
  }

  const jobData = jobResult.data.job;

  // Closed job restriction
  if (jobData.status === 'CLOSED' || jobData.isClosed) {
    return buildRestrictedResponse(
      `Job "${jobData.title}" is closed. Active ranking, screening, and comparison modifications are restricted for closed jobs.`,
      parsed.intent
    );
  }

  // Execute Specialist by Intent
  switch (parsed.intent) {
    case 'RANK_CANDIDATES': {
      if (!activeModes.ranking) {
        return buildUnavailableResponse('Ranking', parsed.intent);
      }

      const rankResult = await runRankingAgent({
        message,
        context: delegateContext(context, {
          jobId,
          candidateScope: 'ALL'
        }),
        provider,
        config,
        toolRunner
      });

      const structured = rankResult.structuredData || {};
      const rankedList = structured.rankedCandidates || [];
      const rankedIds = rankedList.map((c) => c.candidateId);

      let text = `Ranking complete for **${jobData.title}** (${rankedList.length} candidate${rankedList.length === 1 ? '' : 's'}):\n\n`;
      const top3 = rankedList.slice(0, 3);
      top3.forEach((c, idx) => {
        // The ranking result carries `matchScore`; reading `overallScore` here
        // reported every scored candidate as "Unscored".
        text += `${idx + 1}. **${c.candidateName}** — ${c.matchScore != null ? `${c.matchScore}% match` : 'Unscored'} (${c.fitLevel})\n`;
      });

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
        context: delegateContext(context, {
          jobId,
          candidateIds: validIds
        }),
        provider,
        config,
        toolRunner
      });

      const structured = compResult.structuredData || {};
      // Key names follow the comparison result: `candidates` carrying
      // `candidateName`, and `tradeoffs`. Reading the summary off anything else
      // renders "Compared  for Job" with the names silently missing.
      const evalList = structured.candidates || [];
      const names = evalList.map((c) => c.candidateName).join(' and ');

      let text = `Compared ${names} for **${jobData.title}**:\n\n`;
      if (Array.isArray(structured.tradeoffs) && structured.tradeoffs.length > 0) {
        text += `**Key Trade-offs:**\n` + structured.tradeoffs.slice(0, 3).map((t) => `• ${t}`).join('\n') + `\n\n`;
      }
      if (Array.isArray(structured.bestByDimension) && structured.bestByDimension.length > 0) {
        text += `**Best by Dimension:**\n` + structured.bestByDimension.slice(0, 3).map((b) => `• ${b.dimension}: **${b.candidateName}** (${b.reason})`).join('\n');
      }

      const suggestedActions = [
        { label: 'View full comparison', action: 'view_comparison', to: `/ai/comparison?jobId=${jobId}&candidateIds=${validIds.join(',')}` }
      ];

      if (evalList.length > 0) {
        suggestedActions.push({
          label: `Screen ${evalList[0].name}`,
          action: 'screen_candidate',
          mode: 'screening',
          candidateId: evalList[0].candidateId
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
        warnings: structured.dataWarnings || []
      });
    }

    case 'RANK_AND_COMPARE': {
      if (!activeModes.ranking || !activeModes.comparison) {
        return buildUnavailableResponse('Ranking and Comparison', parsed.intent);
      }

      const rankResult = await runRankingAgent({
        message: 'Rank candidates',
        context: delegateContext(context, { jobId, candidateScope: 'ALL' }),
        provider,
        config,
        toolRunner
      });

      const rankStructured = rankResult.structuredData || {};
      const rankedList = rankStructured.rankedCandidates || [];
      const rankedIds = rankedList.map((c) => c.candidateId);

      if (rankedIds.length < 2) {
        return buildAssistantResponse({
          intent: 'RANK_AND_COMPARE',
          status: 'SUCCESS',
          message: `Ranked ${rankedList.length} candidate for **${jobData.title}**. At least 2 candidates are needed for side-by-side comparison.`,
          jobId,
          candidateIds: rankedIds,
          specialistMode: 'ranking',
          result: rankStructured,
          suggestedActions: [
            { label: 'View ranking', action: 'view_ranking', to: `/ai/ranking?jobId=${jobId}` }
          ]
        });
      }

      const count = Math.min(parsed.targetCount || 3, rankedIds.length, 5);
      const topIds = rankedIds.slice(0, count);

      const compResult = await runComparisonAgent({
        message: `Compare top ${count} candidates`,
        context: delegateContext(context, { jobId, candidateIds: topIds }),
        provider,
        config,
        toolRunner
      });

      const compStructured = compResult.structuredData || {};
      // Same result shape as the comparison branch above: `candidates` with
      // `candidateName` and `matchScore`, and `tradeoffs`.
      const evalList = compStructured.candidates || [];

      let text = `Ranked ${rankedList.length} candidates and compared top ${topIds.length} for **${jobData.title}**:\n\n`;
      evalList.forEach((c, idx) => {
        text += `${idx + 1}. **${c.candidateName}** (${c.matchScore != null ? `${c.matchScore}%` : 'Unscored'}) — ${c.fitLevel}\n`;
      });

      if (Array.isArray(compStructured.tradeoffs) && compStructured.tradeoffs.length > 0) {
        text += `\n**Key Comparison Trade-offs:**\n` + compStructured.tradeoffs.slice(0, 2).map((t) => `• ${t}`).join('\n');
      }

      const suggestedActions = [
        { label: 'View comparison', action: 'view_comparison', to: `/ai/comparison?jobId=${jobId}&candidateIds=${topIds.join(',')}` },
        { label: 'View full ranking', action: 'view_ranking', to: `/ai/ranking?jobId=${jobId}` }
      ];

      return buildAssistantResponse({
        intent: 'RANK_AND_COMPARE',
        status: 'SUCCESS',
        message: text,
        jobId,
        candidateIds: topIds,
        specialistMode: 'comparison',
        result: compStructured,
        suggestedActions,
        warnings: compStructured.dataWarnings || []
      });
    }

    case 'SCREEN_CANDIDATE': {
      if (!activeModes.screening) {
        return buildUnavailableResponse('Screening', parsed.intent);
      }

      const resolution = await resolveCandidateForScreening(
        parsed.targetCandidate,
        context,
        jobId,
        toolRunner
      );

      if (resolution.status === 'AMBIGUOUS') {
        const candidateButtons = resolution.candidates.map((c) => ({
          label: `Screen ${c.name}`,
          action: 'screen_candidate',
          candidateId: c.candidateId,
          mode: 'screening'
        }));
        return buildClarificationResponse({
          intent: 'SCREEN_CANDIDATE',
          message: `Multiple candidates match "${parsed.targetCandidate?.name}": ${resolution.candidates.map((c) => c.name).join(', ')}. Which candidate would you like to screen?`,
          suggestedActions: candidateButtons
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

      if (resolution.status === 'UNRESOLVED' || !resolution.candidateId) {
        return buildClarificationResponse({
          intent: 'SCREEN_CANDIDATE',
          message: 'Choose a job or run Ranking first so I know which candidates to work with.',
          suggestedActions: [
            { label: 'Rank candidates first', action: 'rank_candidates', mode: 'ranking' }
          ]
        });
      }

      const targetCandidateId = resolution.candidateId;

      const screenResult = await runScreeningAgent({
        message,
        context: delegateContext(context, {
          jobId,
          candidateIds: [targetCandidateId]
        }),
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
        message: "I didn't quite catch that. You can ask me to rank candidates, compare top candidates, screen a specific candidate, or show recruitment insights.",
        jobId,
        specialistMode: null,
        suggestedActions: [
          { label: 'Rank candidates', action: 'rank_candidates', mode: 'ranking' },
          { label: 'Show insights', action: 'show_insights', mode: 'insights' },
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
