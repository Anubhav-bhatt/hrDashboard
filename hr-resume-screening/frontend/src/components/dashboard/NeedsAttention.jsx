import { CheckCircle2, ClipboardList, GitCompare, Sparkles, UserPlus } from 'lucide-react';

/**
 * Works out the single most useful next step for a job from its real counts.
 *
 * The ordering follows the screening funnel from the end backwards: a role with a
 * chosen candidate only needs closing, which matters more than a pending
 * shortlist, which matters more than unscored resumes, which matter more than a
 * pile of candidates nobody has looked at. Nothing here is a prediction or a
 * recommendation engine — each card states a fact from the job's own numbers and
 * links to the screen where that fact is acted on.
 *
 * @param {Object} job Job summary with aggregated candidate counts
 * @param {number} threshold Shared strong-match score threshold
 * @returns {Object|null} Attention item, or null when the job needs nothing
 */
const deriveNextAction = (job, threshold) => {
  const {
    candidateCount = 0,
    analyzedCount = 0,
    strongMatchCount = 0,
    shortlistedCount = 0,
    selectedCount = 0,
    bestMatchScore = null
  } = job;

  // A closed job is finished by definition.
  if (job.status === 'CLOSED') return null;

  // A chosen candidate on a still-open role leaves exactly one thing to do.
  if (selectedCount > 0 || job.selectedCandidateId) {
    return {
      priority: 0,
      kind: 'close',
      tone: 'mint',
      icon: CheckCircle2,
      fact: selectedCount > 1 ? `${selectedCount} candidates selected.` : 'A candidate has been selected.',
      detail: 'This role is ready to be closed.',
      metric: null,
      actionLabel: 'Close job',
      to: `/jobs/${job.id}`
    };
  }

  if (shortlistedCount > 0) {
    return {
      priority: 1,
      kind: 'decide',
      tone: 'lavender',
      icon: GitCompare,
      fact: `${shortlistedCount} shortlisted candidate${shortlistedCount === 1 ? '' : 's'}.`,
      detail: shortlistedCount === 1 ? 'Ready to make a final decision.' : 'Ready to compare and pick a finalist.',
      metric: bestMatchScore != null ? { label: 'Best match', value: `${Math.round(bestMatchScore)}%` } : null,
      actionLabel: 'Review shortlist',
      to: `/jobs/${job.id}/candidates?hrStatus=SHORTLISTED&sort=score_desc`
    };
  }

  if (candidateCount === 0) {
    return {
      priority: 4,
      kind: 'add-candidates',
      tone: 'neutral',
      icon: UserPlus,
      fact: 'No candidates yet.',
      detail: 'Add resumes to start matching against this role.',
      metric: null,
      actionLabel: 'Add candidates',
      to: `/jobs/${job.id}/import`
    };
  }

  if (analyzedCount === 0) {
    return {
      priority: 2,
      kind: 'score',
      tone: 'amber',
      icon: Sparkles,
      fact: `${candidateCount} candidate${candidateCount === 1 ? '' : 's'} waiting to be scored.`,
      detail: 'None have been matched against this role yet.',
      metric: null,
      actionLabel: 'Score candidates',
      to: `/jobs/${job.id}`
    };
  }

  if (strongMatchCount > 0) {
    return {
      priority: 3,
      kind: 'review-strong',
      tone: 'sky',
      icon: ClipboardList,
      fact: `${strongMatchCount} strong candidate${strongMatchCount === 1 ? '' : 's'} waiting for review.`,
      detail: `Scored ${threshold}% or higher against this role.`,
      metric: bestMatchScore != null ? { label: 'Best match', value: `${Math.round(bestMatchScore)}%` } : null,
      actionLabel: 'Review candidates',
      to: `/jobs/${job.id}/candidates?minScore=${threshold}&sort=score_desc`
    };
  }

  return {
    priority: 5,
    kind: 'review-all',
    tone: 'neutral',
    icon: ClipboardList,
    fact: `${candidateCount} candidate${candidateCount === 1 ? '' : 's'} scored.`,
    detail: `None reached a ${threshold}% match — worth a look before deciding.`,
    metric: bestMatchScore != null ? { label: 'Best match', value: `${Math.round(bestMatchScore)}%` } : null,
    actionLabel: 'Review candidates',
    to: `/jobs/${job.id}/candidates?sort=score_desc`
  };
};

/**
 * Every job that needs something, most urgent first.
 *
 * Exported because the dashboard promotes the first entry into its "Recommended
 * next step" banner. Both surfaces call this one function, so the banner is
 * always literally the head of this list and the two can never disagree about
 * what matters most.
 */
export const deriveAttentionItems = (jobs = [], threshold = 80) =>
  jobs
    .map((job) => {
      const action = deriveNextAction(job, threshold);
      return action ? { ...action, job } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority || b.job.candidateCount - a.job.candidateCount);

export { deriveNextAction };
