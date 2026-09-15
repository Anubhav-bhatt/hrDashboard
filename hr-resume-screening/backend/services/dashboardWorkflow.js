/** One decision rule shared by the recommendation, attention queue and role rows. */
const deriveNextAction = (job) => {
  const id = encodeURIComponent(job.id);
  const candidates = `/candidates?jobId=${id}`;
  const result = (title, description, actionLabel, destination, priority, count = 0) => ({
    title, description, actionLabel, destination, priority, count
  });
  const countLabel = (count) => `${count} candidate${count === 1 ? '' : 's'}`;

  if (job.candidatesCount === 0) {
    return result('Add candidates', 'This role has no candidates yet.', 'Add candidates', `/jobs/${id}/import`, 30);
  }
  if (job.unscoredCount > 0) {
    return result('Score candidates', `${countLabel(job.unscoredCount)} still need scoring.`, 'Review scoring', `/jobs/${id}`, 10, job.unscoredCount);
  }
  if (job.pendingReview > 0) {
    return result('Review candidates', `${countLabel(job.pendingReview)} awaiting recruiter review.`, 'Review candidates', `${candidates}&hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc`, 20, job.pendingReview);
  }
  if (job.shortlisted > 0) {
    return result('Review shortlist', `${countLabel(job.shortlisted)} on the shortlist.`, 'Review shortlist', `${candidates}&hrStatus=SHORTLISTED&sort=score_desc`, 40, job.shortlisted);
  }
  return result('Open job', 'Review the role and its candidate decisions.', 'Open job', `/jobs/${id}`, 50);
};

/** Consider every job, including older roles outside the five-row overview. */
const buildDashboardWorkflow = (jobs, statusGroups, scoreGroups) => {
  const statuses = new Map();
  for (const row of statusGroups) {
    const counts = statuses.get(row.jobId) || {};
    counts[row.hrStatus] = row._count._all;
    statuses.set(row.jobId, counts);
  }
  const scores = new Map(scoreGroups.map((row) => [row.jobId, row]));
  const summaries = jobs.map((job) => {
    const counts = statuses.get(job.id) || {};
    const scored = scores.get(job.id);
    const candidatesCount = scored?._count._all || 0;
    const summary = {
      id: job.id,
      title: job.title,
      createdAt: job.createdAt,
      candidatesCount,
      pendingReview: (counts.REVIEW || 0) + (counts.NEEDS_REVIEW || 0),
      shortlisted: counts.SHORTLISTED || 0,
      unscoredCount: candidatesCount - (scored?._count.overallScore || 0),
      topScore: scored?._max.overallScore ?? null
    };
    return { ...summary, nextAction: deriveNextAction(summary) };
  });
  const ranked = [...summaries].sort((a, b) =>
    a.nextAction.priority - b.nextAction.priority ||
    b.nextAction.count - a.nextAction.count ||
    new Date(b.createdAt) - new Date(a.createdAt) ||
    a.id.localeCompare(b.id)
  );
  const recommendedAction = ranked[0] || null;
  return {
    recommendedAction,
    // The primary recommendation already occupies its own section.
    needsAttention: ranked.filter((job) => job.id !== recommendedAction?.id && job.nextAction.priority < 50).slice(0, 3),
    hiringRoles: summaries.slice(0, 5)
  };
};

module.exports = { deriveNextAction, buildDashboardWorkflow };
