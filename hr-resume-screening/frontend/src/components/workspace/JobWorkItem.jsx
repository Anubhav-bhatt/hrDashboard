import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cx } from '../ui';
import { deriveNextAction } from '../dashboard/NeedsAttention';

/**
 * One role, as a piece of work to continue.
 *
 * This is the unit Minimal Mode is built from: Home renders a queue of them and
 * Active Jobs renders a list of them, so a recruiter reads the same shape in
 * both places and learns it once.
 *
 * It states three things and stops: which role, what is true about it, and the
 * one thing to do next. Everything else about a job — skills, location, created
 * date, the four-figure metric block, the JD — stays in the job workspace, one
 * click away through the title. That restraint is the point; the Standard table
 * is where the full picture belongs.
 *
 * The next step is `deriveNextAction`, the same funnel ordering the dashboard's
 * attention cards and the Standard jobs table already read. Nothing here decides
 * what a recruiter should do — it only renders the existing decision, so the two
 * modes can never recommend different things for the same role.
 */

/**
 * The counts worth saying, and only those.
 *
 * A zero is dropped rather than printed. "0 strong · 0 shortlisted" describes an
 * empty table; "No candidates yet" describes what the recruiter has to do about
 * it, and the row's action already says the rest.
 */
const factsFor = (job) => {
  const total = job.candidateCount || 0;
  /*
   * Nothing to add for an empty role.
   *
   * The next step already says "No candidates yet." above this line, and a
   * supporting line that repeats it word for word is the row saying the same
   * thing twice in two type sizes.
   */
  if (total === 0) return null;

  const facts = [`${total.toLocaleString('en-IN')} candidate${total === 1 ? '' : 's'}`];
  if (job.strongMatchCount > 0) facts.push(`${job.strongMatchCount} strong`);
  if (job.shortlistedCount > 0) facts.push(`${job.shortlistedCount} shortlisted`);
  return facts.join(' · ');
};

/** What a finished role says instead of a next step. */
const outcomeFor = (job) => {
  const hire = job.selectedCandidate || job.hire || null;
  if (hire?.name) return `Selected: ${hire.name}`;
  return 'Closed without a recorded selection';
};

const JobWorkItem = ({
  job,
  threshold = 80,
  /**
   * Home passes the attention item it already derived, so the row states the
   * reason the queue chose it rather than re-deriving a second opinion. Active
   * Jobs passes nothing and the row derives its own — the same function either
   * way, called once instead of twice.
   */
  attention = null,
  className
}) => {
  if (!job) return null;

  const isClosed = job.status === 'CLOSED';
  const action = attention || (isClosed ? null : deriveNextAction(job, threshold));
  const facts = factsFor(job);

  return (
    <li
      className={cx(
        'flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        className
      )}
    >
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          {/*
            The title is the link to everything this row does not show. There is
            no second "View details" beside it — that is the same destination
            twice, and two links to one place is a choice the recruiter should
            not have to make.
          */}
          <h3 className="text-card-title text-slate-900 min-w-0 break-words line-clamp-2">
            <Link
              to={`/jobs/${job.id}`}
              className="rounded hover:text-brand-700 transition-colors duration-fast
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {job.title || 'Untitled role'}
            </Link>
          </h3>
          {/*
            No status chip.
            Every listing that renders these rows is already filtered to one
            lifecycle — Active Jobs shows open roles, Closed Jobs shows closed
            ones — so a badge on every row repeats the page's own heading six
            times over. A finished role states its outcome below instead, which
            is the part that actually differs between one closed role and the
            next.
          */}
        </div>

        {/* Why this role is here, in a recruiter's words. */}
        {action?.fact && <p className="text-body text-slate-700 mt-1">{action.fact}</p>}
        {isClosed && <p className="text-body text-slate-700 mt-1">{outcomeFor(job)}</p>}

        {/* The supporting counts, quieter than the reason above them. */}
        {facts && <p className="text-meta text-slate-500 mt-0.5">{facts}</p>}
      </div>

      {/*
        One action, named for what it does. `deriveNextAction` already knows
        whether this role needs candidates, a review, a comparison or closing, so
        the label is precise instead of a catch-all "Continue".
      */}
      {action?.actionLabel && (
        <Link
          to={action.to}
          className="btn btn-sm btn-secondary shrink-0 justify-center sm:justify-start"
          aria-label={`${action.actionLabel} for ${job.title || 'this role'}`}
        >
          {action.actionLabel}
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      )}
    </li>
  );
};

export default JobWorkItem;
