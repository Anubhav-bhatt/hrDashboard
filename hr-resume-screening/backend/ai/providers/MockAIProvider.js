/**
 * The local, offline provider.
 *
 * Makes zero network calls, requires no API key and costs ₹0.
 *
 * For Phase 4 & Phase 5:
 *   - mode='screening': generates deterministic structured candidate screening assessment
 *     from retrieved job, candidate, and score evidence.
 *   - mode='ranking': generates deterministic structured ranking results with authoritative
 *     stored scores and tie-breaking.
 *   - other modes: returns deterministic placeholder status.
 *
 * Output is fully deterministic — same request in, same object out.
 */
const { AIProvider } = require('./AIProvider');
const {
  computeFitLevel,
  evaluateSkills,
  detectMandatoryGaps,
  evaluateExperience,
  evaluatePriorityInstruction,
  identifyRisks,
  detectDataWarnings,
  computeRecommendation
} = require('../modes/analysis.helpers');

const PROVIDER_NAME = 'mock';
const MODEL_NAME = 'mock-v1';

/** One fixed line per mode, matching the mode ids in `ai/modes/agentModes.js`. */
const MODE_CONTENT = Object.freeze({
  assistant: 'Mock Recruitment Assistant is active.',
  screening: 'Candidate screening analysis completed successfully.',
  ranking: 'Candidate ranking completed successfully.',
  comparison: 'Mock comparison response generated successfully.',
  insights: 'Mock insights response generated successfully.'
});

class MockAIProvider extends AIProvider {
  constructor() {
    super({ name: PROVIDER_NAME, model: MODEL_NAME });
  }

  /**
   * Deterministically evaluates a single candidate for screening.
   *
   * @param {Object} evidence
   * @returns {Object} Structured screening data
   */
  evaluateScreening(evidence) {
    const { job, candidate, score, instruction } = evidence;
    const reqs = job.requirements || {};

    const requiredSkills = reqs.requiredSkills || [];
    const preferredSkills = reqs.preferredSkills || [];
    const candSkills = candidate.skills || [];

    // 1. Skill evaluation
    const skillEval = evaluateSkills(requiredSkills, preferredSkills, candSkills);

    // 2. Experience evaluation
    const candExp =
      candidate.experience?.statedYears ?? candidate.experience?.computedYears ?? null;
    const minExp = reqs.minimumExperience ?? 0;
    const expEval = evaluateExperience(minExp, candExp);

    // 3. Mandatory gaps
    const mandatoryGaps = skillEval.missingRequired;

    // 4. Fit level
    const isScored = Boolean(score && score.isScored);
    const overallScore = isScored ? score.overall : null;
    const fitLevel = computeFitLevel(overallScore, isScored);

    // 5. Recommendation
    const recommendation = computeRecommendation(fitLevel, skillEval.hasMandatoryGaps, isScored);

    // 6. Strengths
    const strengths = [];
    for (const skill of skillEval.matchedRequired) {
      strengths.push(`✓ ${skill} matches mandatory job requirement`);
    }
    for (const skill of skillEval.matchedPreferred) {
      strengths.push(`✓ ${skill} matches preferred skill`);
    }
    if (expEval.meetsRequirement && candExp !== null && minExp > 0) {
      strengths.push(`✓ Experience (${candExp} years) meets minimum requirement (${minExp} years)`);
    }
    if (candidate.currentRole) {
      strengths.push(`✓ Background in relevant role: ${candidate.currentRole}`);
    }

    // 7. Gaps
    const gaps = [];
    for (const missing of skillEval.missingRequired) {
      gaps.push(`Missing mandatory skill: ${missing}`);
    }
    for (const missing of skillEval.missingPreferred) {
      gaps.push(`${missing} listed as preferred but not found in profile`);
    }
    if (expEval.status === 'GAP') {
      gaps.push(`Experience (${candExp ?? 0} years) is below minimum requirement (${minExp} years)`);
    }

    // 8. Risks
    const candSalary = candidate.compensation?.expectedSalary ?? null;
    const salaryMax = reqs.salaryRange?.max ?? null;
    const risks = identifyRisks({
      missingRequired: skillEval.missingRequired,
      expEval,
      candidateLocation: candidate.location,
      preferredLocations: reqs.preferredLocations,
      candSalary,
      salaryMax
    });

    // 9. Criteria Review Table
    const criteria = [];
    for (const skill of requiredSkills) {
      const isMatch = skillEval.matchedRequired.includes(skill);
      criteria.push({
        criterion: skill,
        type: 'Required Skill',
        status: isMatch ? 'MATCH' : 'GAP',
        evidence: isMatch ? `Candidate profile includes ${skill}` : `Not listed in candidate skills`,
        source: 'candidate_profile'
      });
    }
    for (const skill of preferredSkills) {
      const isMatch = skillEval.matchedPreferred.includes(skill);
      criteria.push({
        criterion: skill,
        type: 'Preferred Skill',
        status: isMatch ? 'MATCH' : 'GAP',
        evidence: isMatch ? `Candidate profile includes ${skill}` : `Not listed in candidate skills`,
        source: 'candidate_profile'
      });
    }
    if (minExp > 0) {
      criteria.push({
        criterion: `Min ${minExp} Years Experience`,
        type: 'Experience',
        status: expEval.meetsRequirement ? 'MATCH' : expEval.status === 'GAP' ? 'GAP' : 'UNKNOWN',
        evidence: expEval.message || `${candExp ?? 'Unknown'} years stated experience`,
        source: 'candidate_profile'
      });
    }

    // 10. Data Warnings
    const dataWarnings = detectDataWarnings(candidate, job);

    // 11. Priority instruction evaluation
    const priority = evaluatePriorityInstruction(instruction, candidate, reqs);
    const prioritySignals = priority.applied ? priority.matches.map((m) => `Prioritized criterion matched: ${m}`) : [];

    // 12. Summary
    let summaryText = `${candidate.name || 'Candidate'} is evaluated as a ${fitLevel.toLowerCase().replace('_', ' ')} fit for ${job.title || 'the role'}`;
    if (isScored) {
      summaryText += ` with an authoritative match score of ${overallScore}%.`;
    } else {
      summaryText += ` (unscored candidate).`;
    }
    if (skillEval.hasMandatoryGaps) {
      summaryText += ` Note: Candidate is missing ${mandatoryGaps.length} mandatory skill(s): ${mandatoryGaps.join(', ')}.`;
    }
    if (priority.applied) {
      summaryText += ` Recruiter preference for ${priority.matches.join(', ')} is satisfied.`;
    }

    return {
      candidateId: candidate.id,
      candidateName: candidate.name || 'Unnamed candidate',
      jobId: job.id,
      jobTitle: job.title || 'Untitled job',
      overallScore: isScored ? overallScore : null,
      fitLevel,
      recommendation,
      summary: summaryText,
      strengths,
      gaps,
      mandatoryGaps,
      risks,
      criteria,
      dataWarnings,
      prioritySignals
    };
  }

  /**
   * Deterministically evaluates and ranks candidates for a job.
   *
   * @param {Object} evidence
   * @returns {Object} Structured ranking data
   */
  evaluateRanking(evidence) {
    const { job, candidates = [], candidateScope, totalCandidatesConsidered, returnedCount, instruction, filters } = evidence;
    const reqs = job.requirements || {};
    const requiredSkills = reqs.requiredSkills || [];
    const preferredSkills = reqs.preferredSkills || [];
    const minExp = reqs.minimumExperience ?? 0;

    let instructionApplied = false;
    let instructionDetails = null;

    const evaluated = candidates.map((cand) => {
      const candSkills = cand.skills || [];
      const skillEval = evaluateSkills(requiredSkills, preferredSkills, candSkills);
      const candExp = cand.experience?.statedYears ?? cand.experience?.computedYears ?? null;
      const expEval = evaluateExperience(minExp, candExp);

      const isScored = Boolean(cand.score && cand.score.isScored && cand.score.overallScore !== null);
      const matchScore = isScored ? cand.score.overallScore : null;
      const fitLevel = computeFitLevel(matchScore, isScored);

      const priority = evaluatePriorityInstruction(instruction, cand, reqs);
      if (priority.applied) {
        instructionApplied = true;
        instructionDetails = priority.reason;
      }

      // Compact key strengths (max 3)
      const strengths = [];
      for (const skill of skillEval.matchedRequired.slice(0, 2)) {
        strengths.push(skill);
      }
      if (strengths.length < 3 && candExp !== null && candExp >= minExp && minExp > 0) {
        strengths.push(`${candExp}y exp`);
      }
      for (const skill of skillEval.matchedPreferred) {
        if (strengths.length < 3) strengths.push(skill);
      }

      // Compact main gaps (max 2)
      const gaps = [];
      for (const missing of skillEval.missingRequired.slice(0, 2)) {
        gaps.push(missing);
      }
      for (const missing of skillEval.missingPreferred) {
        if (gaps.length < 2) gaps.push(missing);
      }
      if (gaps.length < 2 && expEval.status === 'GAP') {
        gaps.push(`<${minExp}y exp`);
      }

      const prioritySignals = priority.applied ? priority.matches.map((m) => `Matches priority: ${m}`) : [];

      return {
        candidateId: cand.candidateId,
        candidateName: cand.name || 'Unnamed candidate',
        matchScore,
        fitLevel,
        status: cand.status?.hrStatus || 'APPLIED',
        isShortlisted: Boolean(cand.status?.isShortlisted),
        strengths,
        gaps,
        mandatoryGaps: skillEval.missingRequired,
        priorityMatch: priority.applied,
        prioritySignals,
        // Internal tie-break keys
        _matchedRequiredCount: skillEval.matchedRequired.length,
        _missingMandatoryCount: skillEval.missingRequired.length,
        _candExp: candExp ?? 0
      };
    });

    // Deterministic Sorting Sequence:
    // 1. Authoritative matchScore descending (unscored placed last)
    // 2. Priority match true before false (if instruction applied)
    // 3. Fewer missing mandatory skills (ascending)
    // 4. Higher number of matched required skills (descending)
    // 5. Higher experience (descending)
    // 6. Alphabetical candidateName / candidateId for stable final ordering
    evaluated.sort((a, b) => {
      const scoreA = a.matchScore !== null ? a.matchScore : -1;
      const scoreB = b.matchScore !== null ? b.matchScore : -1;
      if (scoreA !== scoreB) return scoreB - scoreA;

      if (a.priorityMatch !== b.priorityMatch) {
        return a.priorityMatch ? -1 : 1;
      }

      if (a._missingMandatoryCount !== b._missingMandatoryCount) {
        return a._missingMandatoryCount - b._missingMandatoryCount;
      }

      if (a._matchedRequiredCount !== b._matchedRequiredCount) {
        return b._matchedRequiredCount - a._matchedRequiredCount;
      }

      if (a._candExp !== b._candExp) {
        return b._candExp - a._candExp;
      }

      const nameA = a.candidateName || '';
      const nameB = b.candidateName || '';
      const nameCmp = nameA.localeCompare(nameB);
      if (nameCmp !== 0) return nameCmp;

      return (a.candidateId || '').localeCompare(b.candidateId || '');
    });

    // Assign rank positions and clean up internal sorting keys
    const rankedCandidates = evaluated.map((cand, index) => {
      const { _matchedRequiredCount, _missingMandatoryCount, _candExp, ...clean } = cand;
      return {
        rank: index + 1,
        ...clean,
        summary: `${clean.candidateName} ranks #${index + 1} with ${clean.matchScore !== null ? clean.matchScore + '%' : 'unscored'} match.`
      };
    });

    const warnings = [];
    if (returnedCount < totalCandidatesConsidered) {
      warnings.push(`Showing top ${returnedCount} ranked candidates from ${totalCandidatesConsidered} total.`);
    }

    return {
      jobId: job.id,
      jobTitle: job.title || 'Untitled job',
      candidateScope: candidateScope || 'ALL',
      candidateCount: (evidence.context?.candidateIds && evidence.context.candidateIds.length > 0)
        ? evidence.context.candidateIds.length
        : rankedCandidates.length,
      totalCandidatesConsidered: totalCandidatesConsidered ?? candidates.length,
      returnedCount: rankedCandidates.length,
      filterKeys: Object.keys(filters || {}).sort(),
      instruction: instruction || null,
      instructionApplied,
      instructionDetails,
      rankingMethod: 'authoritative_match_score_with_deterministic_tiebreak',
      rankedCandidates,
      warnings
    };
  }

  /**
   * @param {import('../types/ai.types').AIRequest} request
   * @returns {Promise<import('../types/ai.types').AIProviderResult>}
   */
  async run(request) {
    const { mode, message, context, evidence } = request;

    const content = MODE_CONTENT[mode];
    if (!content) {
      throw new Error(`MockAIProvider has no canned response for mode "${mode}".`);
    }

    let structuredData = null;

    if (mode === 'screening' && evidence) {
      structuredData = this.evaluateScreening(evidence);
    } else if (mode === 'ranking' && evidence) {
      structuredData = this.evaluateRanking(evidence);
    } else {
      structuredData = {
        placeholder: true,
        note: 'Generated by the mock provider. No analysis was performed and no model was called.',
        receivedMessageLength: typeof message === 'string' ? message.length : 0,
        jobId: context?.jobId || null,
        candidateCount: context?.candidateIds?.length || 0,
        filterKeys: Object.keys(context?.filters || {}).sort()
      };
    }

    return {
      mode,
      content,
      structuredData,
      provider: PROVIDER_NAME,
      model: MODEL_NAME,
      usage: AIProvider.emptyUsage()
    };
  }
}

module.exports = { MockAIProvider, PROVIDER_NAME, MODEL_NAME, MODE_CONTENT };
