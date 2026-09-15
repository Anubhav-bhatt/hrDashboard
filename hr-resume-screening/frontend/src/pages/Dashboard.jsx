import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, RefreshCw } from 'lucide-react';
import { getDashboardOverview } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useAuth } from '../context/AuthContext';
import { CandidateRow } from '../components/CandidateCard';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { formatRelativeTime } from '../utils/format';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

const SectionHeader = ({ id, title, to, linkLabel }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
    <h2 id={id} className="section-title">{title}</h2>
    {to && <Link to={to} className="dashboard-link">{linkLabel}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>}
  </div>
);

const WorkflowLink = ({ job, primary = false }) => (
  <Link
    to={job.nextAction.destination}
    aria-label={`${job.nextAction.actionLabel} for ${job.title}`}
    className={primary ? 'btn btn-lg btn-primary shrink-0' : 'dashboard-link shrink-0'}
  >
    {job.nextAction.actionLabel}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
  </Link>
);

const Dashboard = () => {
  const { user } = useAuth();
  const { data, error, loading, refetching, refetch } = useApiResource(
    (config) => getDashboardOverview(config), [], { keepPreviousData: true }
  );
  const overview = data?.data;
  const metrics = overview?.metrics;
  const recommended = overview?.recommendedAction;
  const attention = overview?.needsAttention || [];
  const roles = overview?.hiringRoles || [];
  const firstName = (user?.name || '').split(' ')[0] || 'there';
  const scoredTotal = overview?.scoreBands?.reduce((sum, band) => sum + band.count, 0) || 0;
  const snapshot = metrics ? [
    { label: 'Jobs', value: metrics.totalJobs, context: 'All hiring roles', to: '/jobs' },
    { label: 'Candidates', value: metrics.totalCandidates, context: 'Across all roles', to: '/candidates' },
    { label: 'Awaiting review', value: metrics.pendingReview, context: 'Review and second look', to: '/candidates?hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc' },
    { label: 'Shortlisted', value: metrics.shortlisted, context: 'Selected by recruiters', to: '/candidates?hrStatus=SHORTLISTED&sort=score_desc' }
  ] : [];

  return (
    <div className="dashboard space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
        <div className="min-w-0">
          <p className="text-label text-slate-600">Recruitment dashboard</p>
          <h1 className="text-page-title sm:text-display mt-1 break-words">{greeting()}, {firstName}</h1>
          <p className="text-meta text-slate-600 mt-1">
            {metrics?.totalJobs
              ? `${metrics.pendingReview} awaiting review across ${metrics.totalJobs} hiring role${metrics.totalJobs === 1 ? '' : 's'}.`
              : 'Your recruitment work at a glance.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3">
          {overview?.generatedAt && <span className="text-xs text-slate-600">Updated {formatRelativeTime(overview.generatedAt)}</span>}
          <Button variant="ghost" size="lg" icon={RefreshCw} loading={refetching} disabled={loading} onClick={refetch}>Refresh</Button>
        </div>
      </header>

      {error && <ErrorState title={overview ? 'Refresh failed — showing the last loaded snapshot' : 'Unable to load your dashboard'} error={error} onRetry={refetch} />}

      {loading && !overview && (
        <div role="status" aria-label="Loading dashboard" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-28" /><Skeleton className="h-44" />
        </div>
      )}

      {metrics?.totalJobs === 0 && (
        <EmptyState icon={Briefcase} title="No hiring activity yet" description="Create your first role to start reviewing candidates."
          action={<Link to="/jobs/new" className="btn btn-lg btn-primary">Create Job</Link>} />
      )}

      {metrics?.totalJobs > 0 && <>
        <section aria-labelledby="snapshot-title">
          <h2 id="snapshot-title" className="section-title mb-3">Recruitment snapshot</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {snapshot.map((stat) => (
              <Link key={stat.label} to={stat.to} className="dashboard-stat" aria-label={`${stat.label}: ${stat.value}`}>
                <p className="text-meta font-medium text-slate-600">{stat.label}</p>
                <p className="text-metric mt-1 tabular-nums">{stat.value.toLocaleString('en-IN')}</p>
                <p className="text-xs text-slate-600 mt-1">{stat.context}</p>
              </Link>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <section aria-labelledby="recommended-title" className="xl:col-span-2">
          <Card padding="p-4" className="dashboard-panel h-full flex flex-col">
            <h2 id="recommended-title" className="section-title mb-2">Recommended next step</h2>
            {/* Side by side with Needs attention on wide screens, the CTA sits at the card foot. */}
            {recommended ? <div className="flex flex-1 flex-col sm:flex-row xl:flex-col sm:items-center xl:items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-card-title break-words">{recommended.title}</h3>
                <p className="text-meta text-slate-600 mt-1">{recommended.nextAction.description}</p>
              </div>
              <WorkflowLink job={recommended} primary />
            </div> : <p className="text-meta text-slate-600">Open a role to review its candidates.</p>}
          </Card>
        </section>

        <section aria-labelledby="attention-title" className="xl:col-span-3">
          <Card padding="p-4" className="dashboard-panel h-full">
            <h2 id="attention-title" className="section-title mb-1">Needs attention</h2>
            {attention.length ? <ul className="divide-y divide-slate-200">
              {attention.slice(0, 3).map((job) => <li key={job.id} className="flex flex-wrap items-center justify-between gap-x-4 py-2">
                <div className="min-w-0 flex-1 basis-44">
                  <h3 className="text-meta font-semibold break-words">{job.title}</h3>
                  <p className="text-xs text-slate-600 mt-0.5">{job.nextAction.description}</p>
                </div>
                <WorkflowLink job={job} />
              </li>)}
            </ul> : <p className="text-meta text-slate-600 py-2">Nothing else needs attention right now.</p>}
          </Card>
        </section>
        </div>

        <section aria-labelledby="roles-title">
          <Card padding="p-4" className="dashboard-panel">
            <SectionHeader id="roles-title" title="Hiring roles" to="/jobs" linkLabel="View all jobs" />
            <p className="text-xs text-slate-600 mb-2">Recent roles and their review progress.</p>
            <ul className="divide-y divide-slate-200">
              {roles.map((job, index) => <li key={job.id} className={`py-2 flex-col sm:flex-row sm:items-center gap-x-4 ${index > 2 ? 'hidden sm:flex' : 'flex'}`}>
                <Link to={`/jobs/${job.id}`} className="min-w-0 flex-1 min-h-11 flex flex-col justify-center rounded-control" aria-label={`Open job: ${job.title}`}>
                  <h3 className="text-meta font-semibold break-words">{job.title}</h3>
                  <p className="text-xs text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>{job.candidatesCount} candidate{job.candidatesCount === 1 ? '' : 's'}</span>
                    <span>{job.pendingReview} awaiting review</span>
                    <span>{job.topScore === null ? 'Not scored yet' : `Best match ${job.topScore}%`}</span>
                  </p>
                </Link>
                <div><WorkflowLink job={job} /></div>
              </li>)}
            </ul>
          </Card>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <section aria-labelledby="pipeline-title">
            <Card padding="p-4" className="dashboard-panel">
              <SectionHeader id="pipeline-title" title="Hiring pipeline" to="/candidates" linkLabel="View all candidates" />
              {metrics.totalCandidates > 0 ? <ul>
                {overview.pipeline.map((stage) => <li key={stage.key}>
                  <Link to={`/candidates?hrStatus=${stage.key}&sort=score_desc`} className="block min-h-11 py-2 rounded-control" aria-label={`${stage.label}: ${stage.count} candidates`}>
                    <div className="flex items-center justify-between gap-3 text-meta"><span>{stage.label}</span><span className="tabular-nums">{stage.count} <span className="text-xs text-slate-600">({stage.percentage}%)</span></span></div>
                    <div className="dashboard-track mt-1.5"><div className="bg-brand-600 h-full rounded-pill" style={{ width: `${stage.percentage}%` }} /></div>
                  </Link>
                </li>)}
              </ul> : <p className="text-meta text-slate-600 py-2">Add candidates to a role to begin reviewing.</p>}
            </Card>
          </section>
          <section aria-labelledby="quality-title">
            <Card padding="p-4" className="dashboard-panel">
              <h2 id="quality-title" className="section-title mb-2">Match quality</h2>
              <p className="text-xs text-slate-600 mb-1">Strong matches start at {overview.strongMatchThreshold}%. Scores support recruiter decisions.</p>
              {scoredTotal > 0 ? <ul>
                {overview.scoreBands.map((band) => <li key={band.key}>
                  <Link to={`/candidates?minScore=${band.min}${band.max < 100 ? `&maxScore=${band.max}` : ''}&sort=score_desc`} className="flex min-h-11 items-center gap-3 rounded-control text-xs" aria-label={`${band.label}: ${band.count} candidates`}>
                    <span className="w-20 shrink-0">{band.label}</span>
                    <span className="dashboard-track flex-1"><span className="block h-full rounded-pill bg-brand-600" style={{ width: `${Math.round(band.count / scoredTotal * 100)}%` }} /></span>
                    <span className="tabular-nums w-8 text-right">{band.count}</span>
                  </Link>
                </li>)}
              </ul> : <p className="text-meta text-slate-600 py-2">No scored candidates yet. Use the role workspace to review scoring.</p>}
            </Card>
          </section>
        </div>

        <section aria-labelledby="recent-title">
          <Card padding="p-0" className="dashboard-panel">
            <div className="px-4 pt-3"><SectionHeader id="recent-title" title="Recent candidates" to="/candidates?sort=newest" linkLabel="View all candidates" /></div>
            {overview.recentCandidates?.length ? <ul className="divide-y divide-slate-200">
              {overview.recentCandidates.slice(0, 5).map((candidate, index) => <li key={candidate._id} className={index > 2 ? 'hidden sm:block' : ''}><CandidateRow candidate={candidate} /></li>)}
            </ul> : <p className="text-meta text-slate-600 px-4 pb-4">New candidates will appear here after import.</p>}
          </Card>
        </section>
      </>}
    </div>
  );
};

export default Dashboard;
