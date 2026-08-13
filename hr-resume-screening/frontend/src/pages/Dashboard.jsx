import React from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Sparkles,
  UserCheck,
  Users,
  XCircle
} from 'lucide-react';
import { getDashboardOverview } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useAuth } from '../context/AuthContext';
import StatCard, { PipelineStage } from '../components/StatCard';
import { CandidateRow } from '../components/CandidateCard';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  StatCardSkeleton
} from '../components/ui';
import { formatDate, formatRelativeTime, getScoreMeta } from '../utils/format';

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

const Dashboard = () => {
  const { user } = useAuth();
  const { data, error, loading, refetch } = useApiResource(
    (config) => getDashboardOverview(config),
    [],
    { keepPreviousData: true }
  );

  const overview = data?.data;
  const metrics = overview?.metrics;
  const firstName = (user?.name || '').split(' ')[0] || 'there';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-label uppercase text-brand-700">Recruitment dashboard</p>
          <h1 className="text-page-title sm:text-display mt-1.5">
            {greeting()}, {firstName}
          </h1>
          <p className="text-meta text-slate-500 mt-1.5">
            {loading && !overview
              ? 'Loading your hiring snapshot…'
              : metrics
                ? `${metrics.pendingReview} candidate${metrics.pendingReview === 1 ? '' : 's'} waiting on your review across ${metrics.totalJobs} open role${metrics.totalJobs === 1 ? '' : 's'}.`
                : 'Your hiring snapshot across every open role.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/candidates" className="btn btn-md btn-secondary">
            <Users className="w-4 h-4" aria-hidden="true" />
            All candidates
          </Link>
          <Link to="/jobs/new" className="btn btn-md btn-primary">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create job
          </Link>
        </div>
      </div>

      {error && !overview && (
        <ErrorState
          title="Unable to load your dashboard"
          error={error}
          onRetry={refetch}
          action={
            <Link to="/candidates" className="btn btn-sm btn-secondary">
              Go to candidates
            </Link>
          }
        />
      )}

      {/* KPI cards — each card is one full-surface link */}
      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading && !overview ? (
            Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                label="Total candidates"
                value={metrics?.totalCandidates}
                icon={Users}
                tone="brand"
                to="/candidates"
                trend={metrics?.candidatesThisMonth > 0 ? metrics.candidatesThisMonth : undefined}
                trendLabel={metrics?.candidatesThisMonth > 0 ? 'this month' : 'View all candidates'}
              />
              <StatCard
                label="Shortlisted"
                value={metrics?.shortlisted}
                icon={UserCheck}
                tone="emerald"
                to="/candidates?hrStatus=SHORTLISTED&sort=score_desc"
                subtitle="Progressed by recruiters"
              />
              <StatCard
                label="Awaiting review"
                value={metrics?.pendingReview}
                icon={Clock}
                tone="amber"
                to="/candidates?hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc"
                subtitle="Not yet screened"
              />
              <StatCard
                label="Active jobs"
                value={metrics?.totalJobs}
                icon={Briefcase}
                tone="violet"
                to="/jobs"
                trend={metrics?.jobsThisMonth > 0 ? metrics.jobsThisMonth : undefined}
                trendLabel={metrics?.jobsThisMonth > 0 ? 'created this month' : 'Manage open roles'}
              />
            </>
          )}
        </div>

        {/* Secondary metrics */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
            <StatCard
              label="Strong matches (80%+)"
              value={metrics.highMatch}
              icon={Award}
              tone="emerald"
              to="/candidates?minScore=80&sort=score_desc"
              subtitle="Ranked by relevance"
            />
            <StatCard
              label="Average match score"
              value={metrics.averageScore !== null ? `${metrics.averageScore}%` : '—'}
              icon={BarChart3}
              tone="brand"
              subtitle={metrics.averageScore !== null ? `Top score ${metrics.topScore}%` : 'No candidates scored yet'}
            />
            <StatCard
              label="Not suitable"
              value={metrics.notSuitable}
              icon={XCircle}
              tone="rose"
              to="/candidates?hrStatus=NOT_SUITABLE"
              subtitle="Declined after screening"
            />
            <StatCard
              label="Applied this week"
              value={metrics.candidatesThisWeek}
              icon={Sparkles}
              tone="slate"
              to="/candidates?sort=newest"
              subtitle="Last 7 days"
            />
          </div>
        )}
      </section>

      {/* Pipeline + score distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2" padding="p-0">
          <div className="p-5 pb-2">
            <CardHeader
              title="Hiring pipeline"
              description="Every stage links to the matching candidate list."
              actions={
                <Link to="/candidates" className="btn btn-sm btn-ghost">
                  View all
                </Link>
              }
            />
          </div>

          <div className="px-1 pb-3">
            {loading && !overview ? (
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
                  to={`/candidates?hrStatus=${stage.key}&sort=score_desc`}
                />
              ))
            ) : (
              <div className="p-4">
                <EmptyState
                  icon={Users}
                  title="No candidates in the pipeline yet"
                  description="Create a job, then upload resumes or import them from Outlook to start screening."
                  action={
                    <Link to="/jobs/new" className="btn btn-sm btn-primary">
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      Create your first job
                    </Link>
                  }
                  className="border-0 shadow-none py-8"
                />
              </div>
            )}
          </div>
        </Card>

        {/* Score distribution */}
        <Card padding="p-0">
          <div className="p-5 pb-3">
            <CardHeader title="Match distribution" description="Scored candidates by relevance band." />
          </div>

          <div className="px-5 pb-5 space-y-3">
            {loading && !overview ? (
              Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : overview?.scoreBands?.some((b) => b.count > 0) ? (
              overview.scoreBands.map((band) => {
                const total = overview.scoreBands.reduce((sum, b) => sum + b.count, 0);
                const pct = total > 0 ? Math.round((band.count / total) * 100) : 0;
                const meta = getScoreMeta(band.min === 0 ? 10 : band.min);

                return (
                  <Link
                    key={band.key}
                    to={`/candidates?minScore=${band.min}${band.max < 100 ? `&maxScore=${Math.floor(band.max)}` : ''}&sort=score_desc`}
                    className="group block focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 rounded"
                    aria-label={`${band.count} candidates scored ${band.label}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-700 group-hover:text-brand-700 transition-colors duration-fast">
                        {band.label}
                      </span>
                      <span className="tabular-nums text-slate-500">
                        {band.count} <span className="text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-pill bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-pill transition-all duration-slow ${meta.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="text-meta text-slate-500 py-4">
                No candidates have been scored yet. Open a job and run the analysis to populate this chart.
              </p>
            )}
          </div>

          {overview && metrics.unanalyzed > 0 && (
            <div className="mx-5 mb-5 rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs text-amber-900">
                <strong>{metrics.unanalyzed}</strong> candidate{metrics.unanalyzed === 1 ? '' : 's'} not scored yet. Open
                the relevant job to run scoring.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Recent candidates + recent jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2" padding="p-0">
          <div className="p-5 pb-3">
            <CardHeader
              title="Recent candidates"
              description="Newest applications across all roles."
              actions={
                <Link to="/candidates?sort=newest" className="btn btn-sm btn-ghost">
                  View all
                </Link>
              }
            />
          </div>

          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {loading && !overview ? (
              Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="w-8 h-8 rounded-pill" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-36" />
                    <Skeleton className="h-2.5 w-52" />
                  </div>
                </div>
              ))
            ) : overview?.recentCandidates?.length ? (
              overview.recentCandidates.map((candidate) => <CandidateRow key={candidate._id} candidate={candidate} />)
            ) : (
              <div className="p-5">
                <EmptyState
                  icon={FileText}
                  title="No candidates yet"
                  description="Upload resumes against a job to see applicants appear here."
                  className="border-0 shadow-none py-6"
                />
              </div>
            )}
          </div>
        </Card>

        <Card padding="p-0">
          <div className="p-5 pb-3">
            <CardHeader
              title="Recent jobs"
              actions={
                <Link to="/jobs" className="btn btn-sm btn-ghost">
                  View all
                </Link>
              }
            />
          </div>

          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {loading && !overview ? (
              Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="px-4 py-3 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              ))
            ) : overview?.recentJobs?.length ? (
              overview.recentJobs.map((job) => (
                <Link
                  key={job._id}
                  to={`/jobs/${job._id}`}
                  className="group block px-4 py-3 hover:bg-slate-50 transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
                >
                  <p className="text-meta font-semibold text-slate-900 truncate group-hover:text-brand-700 transition-colors duration-fast">
                    {job.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-400">{formatDate(job.createdAt)}</span>
                    {job.requiredSkillCount > 0 && (
                      <Badge variant="neutral">{job.requiredSkillCount} required skills</Badge>
                    )}
                  </div>
                </Link>
              ))
            ) : (
              <div className="p-5">
                <EmptyState
                  icon={Briefcase}
                  title="No jobs yet"
                  action={
                    <Link to="/jobs/new" className="btn btn-sm btn-primary">
                      Create job
                    </Link>
                  }
                  className="border-0 shadow-none py-6"
                />
              </div>
            )}
          </div>
        </Card>
      </div>

      {overview?.generatedAt && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
          Live data, updated {formatRelativeTime(overview.generatedAt)}
          <Button variant="ghost" size="sm" onClick={refetch} className="ml-1">
            Refresh
          </Button>
        </p>
      )}
    </div>
  );
};

export default Dashboard;
