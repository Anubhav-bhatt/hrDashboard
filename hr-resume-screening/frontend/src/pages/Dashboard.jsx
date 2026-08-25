import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  Award,
  BarChart3,
  Briefcase,
  ChevronDown,
  Clock,
  FileText,
  Plus,
  RefreshCw,
  Upload,
  Users,
  X
} from 'lucide-react';
import { getDashboardOverview, getJobsSummary } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useAuth } from '../context/AuthContext';
import StatCard, { PipelineStage } from '../components/StatCard';
import { CandidateRow } from '../components/CandidateCard';
import NeedsAttention, { deriveAttentionItems } from '../components/dashboard/NeedsAttention';
import RecommendedAction from '../components/dashboard/RecommendedAction';
import ActiveHiring from '../components/dashboard/ActiveHiring';
import RecentActivity from '../components/dashboard/RecentActivity';
import RecentHires from '../components/dashboard/RecentHires';
import TopCandidates from '../components/dashboard/TopCandidates';
import CandidateQuickView from '../components/CandidateQuickView';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineAlert,
  Skeleton,
  StatCardSkeleton,
  cx
} from '../components/ui';
import { formatRelativeTime, getScoreMeta } from '../utils/format';

const STAGE_BARS = {
  REVIEW: 'bg-slate-400',
  NEEDS_REVIEW: 'bg-amber-500',
  SHORTLISTED: 'bg-emerald-500',
  NOT_SUITABLE: 'bg-rose-400'
};

/** Greeting based on local time — a small touch that makes the page feel alive. */
const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

/**
 * First run: no jobs exist, so there is nothing to summarise.
 *
 * A dashboard of zeroes is worse than no dashboard — it looks broken, and it
 * gives a new recruiter nothing to do. This replaces the whole page until the
 * first role exists, and names the three steps that follow so the shape of the
 * product is legible before any data is in it.
 */
const WelcomeState = () => (
  <section className="card card-pad-lg max-w-2xl">
    <h2 className="text-section text-slate-900">Welcome to your recruitment workspace</h2>
    <p className="text-body text-slate-600 mt-2">
      Create your first job, then add candidates to start matching them against it.
    </p>

    <ol className="mt-6 space-y-3">
      {[
        'Create a job and describe the role',
        'Upload or import candidate resumes',
        'Review the matches, strongest first'
      ].map((step, index) => (
        <li key={step} className="flex items-start gap-3">
          <span
            className={cx(
              'w-6 h-6 rounded-pill border flex items-center justify-center shrink-0 text-label',
              index === 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
            )}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <span className={cx('text-body', index === 0 ? 'text-slate-900' : 'text-slate-600')}>{step}</span>
        </li>
      ))}
    </ol>

    <Link to="/jobs/new" className="btn btn-md btn-primary mt-6">
      <Plus className="w-4 h-4" aria-hidden="true" />
      Create job
    </Link>
  </section>
);

/**
 * Roles exist but no resumes do. The snapshot and the attention list would both
 * be empty, so the page states the single thing that unblocks everything else.
 */
const NoCandidatesState = ({ jobs }) => {
  const target = jobs[0];

  return (
    <section className="card card-pad-lg max-w-2xl">
      <h2 className="text-section text-slate-900">Ready to start screening?</h2>
      <p className="text-body text-slate-600 mt-2">
        {jobs.length === 1
          ? `Upload resumes for ${target.title} to begin matching candidates against it.`
          : `Upload resumes for one of your ${jobs.length} open roles to begin matching candidates.`}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {target && (
          <Link to={`/jobs/${target.id}/import`} className="btn btn-md btn-primary">
            <Upload className="w-4 h-4" aria-hidden="true" />
            Upload resumes
          </Link>
        )}
        <Link to="/jobs" className="btn btn-md btn-ghost">
          View all jobs
        </Link>
      </div>
    </section>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [quickViewCandidate, setQuickViewCandidate] = useState(null);

  // Analytics stays collapsed until asked for. The first screen is for deciding
  // what to do next; the charts are for understanding a pipeline in depth.
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const selectedJobId = searchParams.get('jobId') || '';

  const { data, error, loading, refetching, refetch } = useApiResource(
    (config) => getDashboardOverview(selectedJobId ? { jobId: selectedJobId } : {}, config),
    [selectedJobId],
    { keepPreviousData: true }
  );

  /*
   * The two requests are deliberately independent.
   *
   * Job summaries drive the recommendation, the attention cards and the active
   * roles; the overview drives the snapshot and everything inside Analytics.
   * Keeping them separate means a slow or failed overview does not withhold the
   * part of the page a recruiter actually acts on, and vice versa. Each section
   * below renders from whichever of the two has arrived.
   */
  const {
    data: jobsData,
    error: jobsError,
    loading: jobsLoading,
    refetch: refetchJobs
  } = useApiResource((config) => getJobsSummary({ sort: 'candidates', status: 'OPEN' }, config), [], {
    keepPreviousData: true
  });

  const jobOptions = jobsData?.data || [];

  const overview = data?.data;
  const metrics = overview?.metrics;
  const scope = overview?.scope;
  const isJobScoped = Boolean(scope?.jobId);
  const threshold = overview?.strongMatchThreshold ?? 80;
  const firstName = (user?.name || '').split(' ')[0] || 'there';

  const overviewLoading = loading && !overview;
  const jobsPending = jobsLoading && !jobsData;

  // One derivation, shared by the recommendation banner and the attention cards.
  const attentionItems = useMemo(() => deriveAttentionItems(jobOptions, threshold), [jobOptions, threshold]);

  /*
   * Which of the guided states applies.
   *
   * Both are gated on data having actually arrived: during the first load
   * `jobOptions` is legitimately empty and `totalCandidates` is undefined, and
   * flashing "Welcome to your recruitment workspace" at an established workspace
   * for one frame would be worse than showing a skeleton.
   */
  const hasLoadedJobs = Boolean(jobsData);
  const showWelcome = hasLoadedJobs && jobOptions.length === 0 && !isJobScoped && !selectedJobId;
  const showNoCandidates =
    hasLoadedJobs &&
    Boolean(overview) &&
    !isJobScoped &&
    jobOptions.length > 0 &&
    (metrics?.totalCandidates ?? 0) === 0;

  const handleJobChange = (jobId) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (jobId) next.set('jobId', jobId);
        else next.delete('jobId');
        return next;
      },
      { replace: true }
    );
  };

  const candidatesLink = (query = '') => {
    if (isJobScoped) return `/jobs/${scope.jobId}/candidates${query ? `?${query}` : ''}`;
    return `/candidates${query ? `?${query}` : ''}`;
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* ------------------------------------------------------------ header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-page-title sm:text-display text-slate-900">
            {greeting()}, {firstName}
          </h1>
          <p className="text-body text-slate-600 mt-1">
            {isJobScoped
              ? `Viewing ${scope.jobTitle} on its own.`
              : "Here's what needs your attention today."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/*
            The scope control appears only when there is a choice to make. With
            one role it would be a dropdown containing a single option, and with
            none it would be empty — either way a control that explains nothing.
          */}
          {jobOptions.length > 1 && (
            <>
              <label htmlFor="dashboard-scope" className="sr-only">
                Focus the dashboard on one role
              </label>
              <select
                id="dashboard-scope"
                className="select text-meta py-1.5 min-w-[11rem]"
                value={selectedJobId}
                onChange={(event) => handleJobChange(event.target.value)}
              >
                <option value="">All active roles</option>
                {jobOptions.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </select>
            </>
          )}

          <Link to="/jobs/new" className="btn btn-sm btn-primary">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Create job</span>
          </Link>
        </div>
      </header>

      {/* A scoped view is a filtered view; say so plainly and offer the way out. */}
      {isJobScoped && (
        <div className="flex items-center gap-2 rounded-control border border-brand-200 bg-brand-50 px-3 py-2">
          <Briefcase className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" />
          <p className="text-meta text-slate-700 min-w-0 flex-1 truncate">
            Filtered to <strong className="text-slate-900">{scope.jobTitle}</strong>
          </p>
          <button
            type="button"
            onClick={() => handleJobChange('')}
            className="btn btn-sm btn-ghost shrink-0"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Show all roles
          </button>
        </div>
      )}

      {/*
        Section-level failure reporting.
        The job-summary error used to be discarded, which meant a failed request
        rendered an empty attention list and an empty role list with no
        explanation — indistinguishable from a workspace with no work in it.
      */}
      {jobsError && (
        <InlineAlert
          tone="error"
          title="Couldn't load your roles"
          message={`${jobsError.message} The snapshot and analytics below are unaffected.`}
        />
      )}

      {showWelcome ? (
        <WelcomeState />
      ) : (
        <>
          {/* --------------------------------------------- recommended step */}
          {!isJobScoped && (jobsPending || attentionItems.length > 0) && (
            <RecommendedAction item={attentionItems[0]} loading={jobsPending} />
          )}

          {showNoCandidates ? (
            <NoCandidatesState jobs={jobOptions} />
          ) : (
            !isJobScoped && (
              <NeedsAttention
                jobs={jobOptions}
                threshold={threshold}
                loading={jobsPending}
                limit={3}
                skip={1}
              />
            )
          )}

          {/* ------------------------------------------ recruitment snapshot */}
          <section aria-labelledby="dashboard-snapshot-heading">
            <div className="min-w-0">
              <h2 id="dashboard-snapshot-heading" className="section-title">
                Recruitment snapshot
              </h2>
              <p className="text-meta text-slate-500 mt-0.5">
                {isJobScoped ? `Totals for ${scope.jobTitle}.` : 'Totals across your whole workspace.'}
              </p>
            </div>

            {error && !overview ? (
              <div className="mt-4">
                <ErrorState title="Unable to load your snapshot" error={error} onRetry={refetch} />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                {overviewLoading ? (
                  Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
                ) : isJobScoped ? (
                  <>
                    <StatCard
                      variant="compact"
                      label="Candidates"
                      value={metrics?.totalCandidates ?? 0}
                      to={candidatesLink('sort=score_desc')}
                      subtitle="In this role"
                    />
                    <StatCard
                      variant="compact"
                      label={`Strong matches`}
                      value={metrics?.strongMatch ?? 0}
                      to={candidatesLink(`minScore=${threshold}&sort=score_desc`)}
                      subtitle={`${threshold}% match or higher`}
                    />
                    <StatCard
                      variant="compact"
                      label="Shortlisted"
                      value={metrics?.shortlisted ?? 0}
                      to={candidatesLink('hrStatus=SHORTLISTED&sort=score_desc')}
                      subtitle="Progressed by you"
                    />
                    <StatCard
                      variant="compact"
                      label="Awaiting review"
                      value={metrics?.pendingReview ?? 0}
                      to={candidatesLink('hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc')}
                      subtitle="Not yet screened"
                    />
                  </>
                ) : (
                  <>
                    <StatCard
                      variant="compact"
                      label="Active jobs"
                      value={metrics?.openJobs ?? 0}
                      to="/jobs"
                      // Only stated when the API actually reports it.
                      subtitle={
                        metrics?.jobsThisMonth > 0 ? `+${metrics.jobsThisMonth} this month` : 'Open positions'
                      }
                    />
                    {/* "Candidates", not "Total applicants": the card navigates to
                        /candidates and sits beside a nav item of the same name, so
                        the label should match the destination. The accessible name
                        is derived from this label, and the e2e suites identify this
                        card by it — it must stay the only link so named. */}
                    <StatCard
                      variant="compact"
                      label="Candidates"
                      value={metrics?.totalCandidates ?? 0}
                      to={candidatesLink('sort=score_desc')}
                      subtitle={
                        metrics?.candidatesThisWeek > 0
                          ? `+${metrics.candidatesThisWeek} this week`
                          : 'Across all roles'
                      }
                    />
                    <StatCard
                      variant="compact"
                      label="Shortlisted"
                      value={metrics?.shortlisted ?? 0}
                      to={candidatesLink('hrStatus=SHORTLISTED&sort=score_desc')}
                      subtitle="Progressed by you"
                    />
                    <StatCard
                      variant="compact"
                      label="Hires"
                      value={metrics?.selectedCandidates ?? 0}
                      to={candidatesLink('hrStatus=SELECTED')}
                      subtitle="Candidates selected"
                    />
                  </>
                )}
              </div>
            )}
          </section>

          {/* ------------------------------------------------ active hiring */}
          {!isJobScoped && <ActiveHiring jobs={jobOptions} loading={jobsPending} limit={4} />}

          {/* ---------------------------------------------- recent activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-6">
            <RecentActivity
              candidates={overview?.recentCandidates || []}
              loading={overviewLoading}
              viewAllTo={candidatesLink('sort=newest')}
              limit={5}
            />

            {/* Hiring outcomes only mean something across roles, so a single-job
                view stays about that job's own pipeline. */}
            {!isJobScoped && (
              <div>
                <RecentHires hires={overview?.recentHires || []} loading={overviewLoading} />
              </div>
            )}
          </div>

          {/*
            Analytics, collapsed by default.
            Nothing is hidden away permanently: the pipeline, match distribution,
            top candidates and recent candidates all live here. They simply no
            longer occupy the first screen, which is for deciding what to do next.
          */}
          <section aria-label="Analytics">
            <button
              type="button"
              onClick={() => setAnalyticsOpen((open) => !open)}
              aria-expanded={analyticsOpen}
              aria-controls="dashboard-analytics"
              className="w-full card card-pad-sm flex items-center justify-between gap-3 text-left
                         hover:border-slate-300 transition-colors duration-fast
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <span className="min-w-0">
                <span className="section-title flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  Analytics
                </span>
                <span className="block text-meta text-slate-500 mt-0.5">
                  Pipeline, match distribution, top candidates and recent applications.
                </span>
              </span>
              <ChevronDown
                className={cx(
                  'w-4 h-4 text-slate-500 shrink-0 transition-transform duration-fast',
                  analyticsOpen && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>
          </section>

          <div id="dashboard-analytics" hidden={!analyticsOpen} className="space-y-5">
            {/* Secondary metrics, kept out of the headline row. */}
            {overview && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {isJobScoped ? (
                  <>
                    <StatCard
                      label="Best match"
                      value={metrics?.bestMatchScore != null ? `${metrics.bestMatchScore}%` : '—'}
                      icon={Award}
                      tone="violet"
                      to={candidatesLink('sort=score_desc')}
                      subtitle="Highest scoring candidate"
                    />
                    <StatCard
                      label="Average match score"
                      value={metrics?.averageScore != null ? `${metrics.averageScore}%` : '—'}
                      icon={BarChart3}
                      tone="brand"
                      subtitle={
                        metrics?.averageScore != null ? `Top score ${metrics.topScore}%` : 'No candidates scored yet'
                      }
                    />
                    <StatCard
                      label="Needs review"
                      value={metrics?.needsReview ?? 0}
                      icon={Clock}
                      tone="amber"
                      to={candidatesLink('hrStatus=NEEDS_REVIEW')}
                      subtitle="Flagged for a second look"
                    />
                    <StatCard
                      label="Not suitable"
                      value={metrics?.notSuitable ?? 0}
                      icon={FileText}
                      tone="rose"
                      to={candidatesLink('hrStatus=NOT_SUITABLE')}
                      subtitle="Declined after screening"
                    />
                  </>
                ) : (
                  <>
                    <StatCard
                      label={`Strong matches (${threshold}%+)`}
                      value={metrics?.strongMatch ?? 0}
                      icon={Award}
                      tone="emerald"
                      to={candidatesLink(`minScore=${threshold}&sort=score_desc`)}
                      subtitle="Ranked by relevance"
                    />
                    <StatCard
                      label="Awaiting review"
                      value={metrics?.pendingReview ?? 0}
                      icon={Clock}
                      tone="amber"
                      to={candidatesLink('hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc')}
                      subtitle="Not yet screened"
                    />
                    <StatCard
                      label="Closed jobs"
                      value={metrics?.closedJobs ?? 0}
                      icon={Archive}
                      tone="brand"
                      to="/jobs/closed"
                      subtitle="Filled and archived"
                    />
                    <StatCard
                      label="Average match score"
                      value={metrics?.averageScore != null ? `${metrics.averageScore}%` : '—'}
                      icon={BarChart3}
                      tone="brand"
                      subtitle={
                        metrics?.averageScore != null ? `Top score ${metrics.topScore}%` : 'No candidates scored yet'
                      }
                    />
                  </>
                )}
              </div>
            )}

            {/* Top candidates + match distribution for the active scope */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <TopCandidates
                  candidates={overview?.topCandidates || []}
                  loading={overviewLoading}
                  jobTitle={isJobScoped ? scope.jobTitle : null}
                  viewAllTo={candidatesLink('sort=score_desc')}
                  onSelectCandidate={setQuickViewCandidate}
                />
              </div>

              <Card padding="p-0">
                <div className="p-5 pb-3">
                  <CardHeader
                    title="Match score distribution"
                    description={
                      isJobScoped
                        ? `Scored candidates on ${scope.jobTitle}.`
                        : 'Scored candidates by relevance band.'
                    }
                  />
                </div>

                <div className="px-5 pb-5 space-y-3">
                  {overviewLoading ? (
                    Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)
                  ) : overview?.scoreBands?.some((b) => b.count > 0) ? (
                    overview.scoreBands.map((band) => {
                      const total = overview.scoreBands.reduce((sum, b) => sum + b.count, 0);
                      const pct = total > 0 ? Math.round((band.count / total) * 100) : 0;
                      const meta = getScoreMeta(band.min === 0 ? 10 : band.min);

                      return (
                        <Link
                          key={band.key}
                          to={candidatesLink(
                            `minScore=${band.min}${band.max < 100 ? `&maxScore=${Math.floor(band.max)}` : ''}&sort=score_desc`
                          )}
                          className="group block focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 rounded"
                          aria-label={`${band.count} candidates scored ${band.label}`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-700 group-hover:text-brand-700 transition-colors duration-fast">
                              {band.label}
                            </span>
                            <span className="tabular-nums text-slate-500">
                              {band.count} <span className="text-slate-500">({pct}%)</span>
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 w-full rounded-pill bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-pill transition-all duration-slow ${meta.bar}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </Link>
                      );
                    })
                  ) : (
                    <p className="text-meta text-slate-500 py-4">
                      No candidates have been scored{isJobScoped ? ' on this role' : ''} yet.
                    </p>
                  )}
                </div>

                {overview && metrics?.unanalyzed > 0 && (
                  <div className="mx-5 mb-5 rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-xs text-amber-900">
                      <strong>{metrics.unanalyzed}</strong> candidate{metrics.unanalyzed === 1 ? '' : 's'} not scored
                      yet.
                    </p>
                  </div>
                )}
              </Card>
            </div>

            {/* Hiring pipeline + recent candidates */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <Card className="lg:col-span-2" padding="p-0">
                <div className="p-5 pb-2">
                  <CardHeader
                    title="Hiring pipeline"
                    description={
                      isJobScoped
                        ? `Review stages for ${scope.jobTitle}.`
                        : 'Every stage links to the matching candidate list.'
                    }
                  />
                </div>

                <div className="px-1 pb-3">
                  {overviewLoading ? (
                    <div className="space-y-3 p-4">
                      {Array.from({ length: 4 }, (_, i) => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-1.5 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : overview?.pipeline?.some((s) => s.count > 0) ? (
                    overview.pipeline.map((stage) => (
                      <PipelineStage
                        key={stage.key}
                        label={stage.label}
                        description={stage.description}
                        count={stage.count}
                        percentage={stage.percentage}
                        barClass={STAGE_BARS[stage.key]}
                        to={candidatesLink(`hrStatus=${stage.key}&sort=score_desc`)}
                      />
                    ))
                  ) : (
                    <div className="p-4">
                      <EmptyState
                        icon={Users}
                        title="No candidates in the pipeline yet"
                        description={
                          isJobScoped
                            ? 'Import resumes for this role to start screening.'
                            : 'Create a job, then upload resumes or import them from Outlook.'
                        }
                        action={
                          isJobScoped ? (
                            <Link to={`/jobs/${scope.jobId}/import`} className="btn btn-sm btn-primary">
                              Add candidates
                            </Link>
                          ) : (
                            <Link to="/jobs/new" className="btn btn-sm btn-primary">
                              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                              Create your first job
                            </Link>
                          )
                        }
                        className="border-0 shadow-none py-8"
                      />
                    </div>
                  )}
                </div>
              </Card>

              <Card padding="p-0">
                <div className="p-5 pb-3">
                  <CardHeader
                    title="Recent candidates"
                    description={
                      isJobScoped
                        ? `Newest applications for ${scope.jobTitle}.`
                        : 'Newest applications across all roles.'
                    }
                    actions={
                      <Link to={candidatesLink('sort=newest')} className="btn btn-sm btn-ghost">
                        View all
                      </Link>
                    }
                  />
                </div>

                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {overviewLoading ? (
                    Array.from({ length: 5 }, (_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <Skeleton className="w-8 h-8 rounded-pill" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-2.5 w-44" />
                        </div>
                      </div>
                    ))
                  ) : overview?.recentCandidates?.length ? (
                    overview.recentCandidates
                      .slice(0, 6)
                      .map((candidate) => <CandidateRow key={candidate.id || candidate._id} candidate={candidate} />)
                  ) : (
                    <div className="p-5">
                      <EmptyState icon={FileText} title="No candidates yet" className="border-0 shadow-none py-6" />
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* --------------------------------------------------------- freshness */}
      {overview?.generatedAt && (
        <p className="flex items-center gap-1.5 text-meta text-slate-500">
          <span>Updated {formatRelativeTime(overview.generatedAt)}</span>
          {/* `loading` handles the spinner, the disabled state and aria-busy, so a
              second refresh cannot be queued while one is in flight. */}
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            loading={refetching}
            onClick={() => {
              refetch();
              refetchJobs();
            }}
          >
            {refetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        </p>
      )}

      {/* Candidate Quick View Slide-Over */}
      <CandidateQuickView
        candidate={quickViewCandidate}
        jobId={quickViewCandidate?.jobId}
        isOpen={Boolean(quickViewCandidate)}
        onClose={() => setQuickViewCandidate(null)}
      />
    </div>
  );
};

export default Dashboard;
