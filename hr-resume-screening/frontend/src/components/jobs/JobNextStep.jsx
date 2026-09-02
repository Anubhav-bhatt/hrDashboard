import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, GitCompare, ListOrdered, Sparkles, Upload } from 'lucide-react';
import { Button, cx } from '../ui';
import { deriveNextAction } from '../dashboard/NeedsAttention';
import { buildAgentPath, SOURCE_WORKFLOWS } from '../../context/RecruitmentContext';

/**
 * The one thing to do next on this vacancy, stated rather than implied.
 *
 * The recommendation reuses `deriveNextAction` — the same function the dashboard's
 * attention cards use — instead of restating the rules here. That matters: the
 * dashboard telling a recruiter to review a role and the role itself suggesting
 * something else would make both untrustworthy, and two copies of a funnel
 * ordering drift the moment either is edited.
 *
 * The action is a link to a screen that already knows its context. Nothing here
 * asks the recruiter to re-pick the job they are looking at.
 */

/**
 * Tools worth offering for the state the job is actually in.
 *
 * Ranking needs something to rank; comparison needs at least two shortlisted
 * people to compare. Offering "Compare shortlisted" on a role with no shortlist
 * is a button that can only disappoint, so it is not rendered.
 */
const contextualTools = ({ jobId, stats }) => {
  const tools = [];
  const analyzed = stats?.analyzedCount ?? 0;
  const shortlisted = stats?.shortlistedCount ?? 0;

  if (analyzed > 0) {
    tools.push({
      key: 'rank',
      label: 'Rank candidates',
      icon: ListOrdered,
      to: buildAgentPath('ranking', { jobId, source: SOURCE_WORKFLOWS.job })
    });
  }

  if (shortlisted >= 2) {
    tools.push({
      key: 'compare',
      label: `Compare ${shortlisted} shortlisted`,
      icon: GitCompare,
      to: buildAgentPath('comparison', { jobId, source: SOURCE_WORKFLOWS.job })
    });
  }

  return tools;
};

const JobNextStep = ({
  job,
  stats,
  threshold = 80,
  onCloseJob,
  onScore,
  scoring = false,
  closing = false,
  className
}) => {
  if (!job) return null;

  // A closed job has nothing left to recommend, and deriveNextAction returns
  // null for it — so this section simply does not render.
  const action = deriveNextAction(
    {
      id: job.id,
      status: job.status,
      selectedCandidateId: job.selectedCandidateId,
      candidateCount: stats?.candidateCount ?? 0,
      analyzedCount: stats?.analyzedCount ?? 0,
      strongMatchCount: stats?.strongMatchCount ?? 0,
      shortlistedCount: stats?.shortlistedCount ?? 0,
      selectedCount: stats?.selectedCount ?? 0,
      bestMatchScore: stats?.bestMatchScore ?? null
    },
    threshold
  );

  if (!action) return null;

  const tools = contextualTools({ jobId: job.id, stats });
  // A shortlist is what makes closing possible; the backend enforces the same rule.
  const canClose = job.status !== 'CLOSED' && (stats?.shortlistedCount ?? 0) > 0;

  return (
    <section
      aria-labelledby="job-next-step-heading"
      className={cx('rounded-panel border border-brand-200 bg-brand-50 px-5 py-4 sm:px-6 sm:py-5', className)}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <h2
            id="job-next-step-heading"
            className="text-label uppercase text-brand-700 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            Recommended next step
          </h2>
          <p className="text-body text-slate-900 mt-1.5">
            {action.fact} {action.detail}
          </p>
        </div>

        {/*
          Two of the six recommendations are not navigations.
          `deriveNextAction` targets `/jobs/:id` for "close" and "score", which is
          correct from the dashboard but is a link to the current page from inside
          the workspace. Here they run the action they name — the closure dialog
          and the re-scoring request — so the recommendation is never a button
          that appears to do nothing.
        */}
        {action.kind === 'close' && onCloseJob ? (
          <Button
            variant="primary"
            icon={CheckCircle2}
            loading={closing}
            onClick={onCloseJob}
            className="shrink-0 justify-center"
          >
            Close job
          </Button>
        ) : action.kind === 'score' && onScore ? (
          <Button
            variant="primary"
            icon={Sparkles}
            loading={scoring}
            onClick={onScore}
            className="shrink-0 justify-center"
          >
            {scoring ? 'Scoring…' : action.actionLabel}
          </Button>
        ) : (
          <Link
            to={action.to}
            className="btn btn-md btn-primary shrink-0 justify-center"
            aria-label={`${action.actionLabel} for ${job.title}`}
          >
            {action.actionLabel}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* Secondary, and visibly so: text actions rather than a second row of
          filled buttons competing with the recommendation above. */}
      {(tools.length > 0 || canClose) && (
        <div className="mt-4 pt-3 border-t border-brand-200/70 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-meta text-slate-500">Also available</span>

          {/*
            Closing is available from a shortlist onwards, not only once someone
            is already selected.
            `deriveNextAction` reports kind 'close' when a candidate has been
            selected — but in this product a candidate is selected *by* closing
            the job, through the dialog this opens. Gating the control on that
            kind left a shortlisted role with no way to be closed at all, so it
            is offered here whenever a shortlist exists, while the recommendation
            above stays "review the shortlist" for anyone still deciding.
          */}
          {canClose && onCloseJob && (
            <button
              type="button"
              onClick={onCloseJob}
              disabled={closing}
              className="inline-flex items-center gap-1.5 text-meta font-bold text-brand-700 hover:text-brand-800
                         disabled:opacity-60 rounded focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              {closing ? 'Loading shortlist…' : 'Close job'}
            </button>
          )}

          {tools.map((tool) => (
            <Link
              key={tool.key}
              to={tool.to}
              className="inline-flex items-center gap-1.5 text-meta font-bold text-brand-700 hover:text-brand-800
                         rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <tool.icon className="w-3.5 h-3.5" aria-hidden="true" />
              {tool.label}
            </Link>
          ))}
          <Link
            to={`/jobs/${job.id}/import`}
            className="inline-flex items-center gap-1.5 text-meta font-bold text-brand-700 hover:text-brand-800
                       rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            Add candidates
          </Link>
        </div>
      )}
    </section>
  );
};

export default JobNextStep;
