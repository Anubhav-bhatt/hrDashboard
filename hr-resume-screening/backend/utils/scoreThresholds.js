/**
 * Single source of truth for score-band semantics.
 *
 * These thresholds were previously duplicated with conflicting values — the job
 * list treated 90+ as a "high match" while the dashboard used 80+ for the same
 * label. Every count now derives from here so the number a recruiter sees on a
 * job card, on the dashboard and on a candidate list always means the same thing.
 *
 * The bands mirror the alignment labels produced by the scoring engine:
 *   90-100  Excellent Alignment
 *   80-89   Strong Alignment
 *   70-79   Good Alignment
 *   60-69   Partial Alignment
 *   <60     Low Alignment
 */

/** A "strong match" is 80% or better, i.e. Strong Alignment and above. */
const STRONG_MATCH_MIN = 80;

/** An "excellent match" is 90% or better. */
const EXCELLENT_MATCH_MIN = 90;

/** Statuses that mean "a recruiter has not finished screening this candidate". */
const PENDING_REVIEW_STATUSES = ['REVIEW', 'NEEDS_REVIEW'];

/** Display bands used by the dashboard and job analytics charts. */
const SCORE_BANDS = [
  { key: 'excellent', label: '90-100%', min: 90, max: 100 },
  { key: 'strong', label: '80-89%', min: 80, max: 89.999 },
  { key: 'good', label: '70-79%', min: 70, max: 79.999 },
  { key: 'partial', label: '60-69%', min: 60, max: 69.999 },
  { key: 'low', label: 'Below 60%', min: 0, max: 59.999 }
];

module.exports = {
  STRONG_MATCH_MIN,
  EXCELLENT_MATCH_MIN,
  PENDING_REVIEW_STATUSES,
  SCORE_BANDS
};
