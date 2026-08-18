/**
 * Scoring tools.
 *
 *   getCandidateScore    -> services/candidateService.getCandidateScoreRecord
 *   getScoringBreakdown  -> services/candidateService.getCandidateScoreRecord
 *   getJobRankingData    -> services/candidateService.listCandidatesForJob
 *
 * The rule that matters here: these tools **retrieve** the score the application
 * already computed and stored. They do not compute one.
 *
 * `services/candidateMatcher.js` is the only thing in this system that produces a
 * score, and it runs during resume ingestion and re-analysis. Its output is
 * persisted on the candidate row. A second scoring path — an agent forming its own
 * opinion of a candidate's fit — would mean the number in a chat answer could
 * disagree with the number on the candidate's card, and a recruiter would have no
 * way to tell which one the shortlist was built from. So there is exactly one
 * scorer, and this layer reads it.
 *
 * An unscored candidate is reported as unscored. It is never given a zero, and
 * never given an estimate.
 *
 * Ranking is likewise the application's: `getJobRankingData` asks the candidate
 * service for its normal `score_desc` ordering (highest first, unscored last, as
 * defined by `SORT_OPTIONS` in utils/candidateQuery.js) and numbers the rows. It
 * does not re-sort them.
 */
const { getCandidateScoreRecord, listCandidatesForJob } = require('../../services/candidateService');
const weights = require('../../utils/scoringWeights');
const { STRONG_MATCH_MIN, EXCELLENT_MATCH_MIN } = require('../../utils/scoreThresholds');
const { PERMISSIONS } = require('./permissions');
const { resourceNotFound } = require('../errors/tool.errors');
const { toAICandidateSummary, CAPS } = require('./mappers');
const { requireObject, requireId, requireLimit } = require('./validators');
const {
  effectiveMaxCandidateLimit,
  effectiveDefaultCandidateLimit
} = require('./candidates.tools');

/**
 * The scoring dimensions that actually exist, with the weight each contributes.
 *
 * Taken from `utils/scoringWeights.js` rather than restated, so a change to the
 * weights cannot leave this description stale.
 *
 * Note what is absent. Location, salary and notice period are **not** scored
 * dimensions: location and salary are computed as compatibility flags
 * (true/false/null) and notice period is not modelled at all. Presenting either
 * as a score would invent a number the application never produced.
 */
const SCORE_DIMENSIONS = Object.freeze([
  { key: 'requiredSkills', field: 'requiredSkillScore', maxPoints: weights.REQUIRED_SKILLS },
  { key: 'experience', field: 'experienceScore', maxPoints: weights.EXPERIENCE },
  { key: 'roleRelevance', field: 'roleScore', maxPoints: weights.ROLE_RELEVANCE },
  { key: 'preferredSkills', field: 'preferredSkillScore', maxPoints: weights.PREFERRED_SKILLS },
  { key: 'projects', field: 'projectScore', maxPoints: weights.PROJECTS },
  { key: 'education', field: 'educationScore', maxPoints: weights.EDUCATION }
]);

/** Dimensions a caller might expect but which this application does not score. */
const UNSCORED_CRITERIA = Object.freeze(['location', 'salary', 'noticePeriod']);

const asArray = (value, cap) => (Array.isArray(value) ? value.slice(0, cap) : []);

const getCandidateScore = {
  name: 'getCandidateScore',
  description:
    'Retrieve the stored match score for a candidate. Returns the application’s existing result; never computes a new one.',
  category: 'scoring',
  readOnly: true,
  permission: PERMISSIONS.SCORES_READ,
  service: 'services/candidateService.getCandidateScoreRecord',

  validate: (input) => {
    const raw = requireObject(input, ['candidateId', 'jobId']);
    return {
      candidateId: requireId(raw.candidateId, 'candidateId'),
      jobId: requireId(raw.jobId, 'jobId', { required: false })
    };
  },

  execute: async ({ candidateId, jobId }) => {
    const record = await getCandidateScoreRecord(candidateId, { jobId });
    if (!record) throw resourceNotFound('Candidate');

    const isScored = record.overallScore !== null && record.overallScore !== undefined;

    return {
      data: {
        candidateId: record.id,
        jobId: record.jobId,
        isScored,
        // Null, not zero. An unevaluated candidate has no score, and treating
        // that as the lowest possible score would rank them below a genuinely
        // poor match.
        overallScore: isScored ? record.overallScore : null,
        alignmentLabel: isScored ? record.alignmentLabel : null,
        analyzedAt: record.analyzedAt ?? null,
        band: isScored
          ? {
              isStrongMatch: record.overallScore >= STRONG_MATCH_MIN,
              isExcellentMatch: record.overallScore >= EXCELLENT_MATCH_MIN,
              strongMatchThreshold: STRONG_MATCH_MIN,
              excellentMatchThreshold: EXCELLENT_MATCH_MIN
            }
          : null,
        ...(isScored ? {} : { reason: 'This candidate has not been analysed yet.' })
      },
      metadata: { resultCount: 1, candidateId, jobId: record.jobId, source: 'stored' }
    };
  }
};

const getScoringBreakdown = {
  name: 'getScoringBreakdown',
  description:
    'Retrieve the per-dimension breakdown behind a candidate’s stored score, including matched and missing skills.',
  category: 'scoring',
  readOnly: true,
  permission: PERMISSIONS.SCORES_READ,
  service: 'services/candidateService.getCandidateScoreRecord',

  validate: (input) => {
    const raw = requireObject(input, ['candidateId', 'jobId']);
    return {
      candidateId: requireId(raw.candidateId, 'candidateId'),
      jobId: requireId(raw.jobId, 'jobId', { required: false })
    };
  },

  execute: async ({ candidateId, jobId }) => {
    const record = await getCandidateScoreRecord(candidateId, { jobId });
    if (!record) throw resourceNotFound('Candidate');

    const isScored = record.overallScore !== null && record.overallScore !== undefined;

    if (!isScored) {
      return {
        data: {
          candidateId: record.id,
          jobId: record.jobId,
          isScored: false,
          overallScore: null,
          breakdown: null,
          reason: 'This candidate has not been analysed yet, so no breakdown exists.'
        },
        metadata: { resultCount: 1, candidateId, jobId: record.jobId, source: 'stored' }
      };
    }

    const breakdown = {};
    for (const dimension of SCORE_DIMENSIONS) {
      const points = record[dimension.field];
      breakdown[dimension.key] = {
        points: points ?? null,
        maxPoints: dimension.maxPoints,
        // A percentage of the dimension's own weight, so "skills: 91" is
        // comparable across dimensions with different point values.
        percentage:
          points === null || points === undefined ? null : Math.round((points / dimension.maxPoints) * 100)
      };
    }

    return {
      data: {
        candidateId: record.id,
        jobId: record.jobId,
        isScored: true,
        overallScore: record.overallScore,
        alignmentLabel: record.alignmentLabel,
        analyzedAt: record.analyzedAt ?? null,
        breakdown,
        skills: {
          matched: asArray(record.matchedSkills, CAPS.matchedSkills),
          missingRequired: asArray(record.missingRequiredSkills, CAPS.missingSkills),
          matchedPreferred: asArray(record.matchedPreferredSkills, CAPS.matchedSkills)
        },
        strengths: asArray(record.strengths, CAPS.strengths),
        gaps: asArray(record.gaps, CAPS.gaps)
      },
      metadata: {
        resultCount: 1,
        candidateId,
        jobId: record.jobId,
        source: 'stored',
        totalPoints: 100,
        // Stated so a consumer does not read an absent dimension as a zero score.
        criteriaNotScored: UNSCORED_CRITERIA
      }
    };
  }
};

const getJobRankingData = {
  name: 'getJobRankingData',
  description:
    'Retrieve a job’s candidates in the application’s existing score ranking, with their stored scores.',
  category: 'scoring',
  readOnly: true,
  permission: PERMISSIONS.SCORES_READ,
  service: 'services/candidateService.listCandidatesForJob',

  validate: (input, { config }) => {
    const raw = requireObject(input, ['jobId', 'limit']);
    return {
      jobId: requireId(raw.jobId, 'jobId'),
      limit: requireLimit(raw.limit, {
        defaultLimit: effectiveDefaultCandidateLimit(config),
        maxLimit: effectiveMaxCandidateLimit(config)
      })
    };
  },

  execute: async ({ jobId, limit }) => {
    // `score_desc` is the application's own default candidate ordering: score
    // descending with unscored last. The rows are numbered in the order the
    // service returns them and are not re-sorted here.
    const result = await listCandidatesForJob(jobId, { limit, page: 1, sort: 'score_desc' });
    if (!result) throw resourceNotFound('Job');

    const ranked = result.candidates.map((candidate, index) => {
      const summary = toAICandidateSummary(candidate);
      return {
        rank: index + 1,
        candidateId: summary.candidateId,
        name: summary.name,
        overallScore: summary.score.overallScore,
        alignmentLabel: summary.score.alignmentLabel,
        isScored: summary.score.isScored,
        hrStatus: summary.status.hrStatus
      };
    });

    return {
      data: { jobId, ranking: ranked },
      metadata: {
        resultCount: ranked.length,
        totalMatching: result.pagination.total,
        limit,
        jobId,
        ordering: 'score_desc',
        orderingSource: 'utils/candidateQuery.SORT_OPTIONS',
        unscoredCount: ranked.filter((row) => !row.isScored).length
      }
    };
  }
};

module.exports = {
  getCandidateScore,
  getScoringBreakdown,
  getJobRankingData,
  SCORE_DIMENSIONS,
  UNSCORED_CRITERIA
};
