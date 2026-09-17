import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Briefcase, Plus, RefreshCw, X } from 'lucide-react';
import { getDashboardOverview, getJobsSummary } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useAuth } from '../context/AuthContext';
import { CandidateRow } from '../components/CandidateCard';
import { deriveAttentionItems, deriveNextAction } from '../components/dashboard/NeedsAttention';
import { Button, Card, EmptyState, ErrorState, InlineAlert, Skeleton } from '../components/ui';
import { formatRelativeTime } from '../utils/format';
import { useRecruitmentContext } from '../context/RecruitmentContext';
import { useWorkspaceMode } from '../context/WorkspaceModeContext';
import WorkspacePage from '../components/layout/WorkspacePage';
import MinimalHome from '../components/dashboard/MinimalHome';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

const plural = (count, word) => `${count.toLocaleString('en-IN')} ${word}${count === 1 ? '' : 's'}`;

const SectionHeader = ({ id, title, to, linkLabel }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
    <h2 id={id} className="section-title">{title}</h2>
    {to && <Link to={to} className="dashboard-link">{linkLabel}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>}
  </div>
);

/** An attention item from `deriveNextAction`, as a link. */
const WorkflowLink = ({ item, primary = false }) => (
  <Link
    to={item.to}
    aria-label={`${item.actionLabel} for ${item.job.title}`}
    className={primary ? 'btn btn-lg btn-primary shrink-0' : 'dashboard-link shrink-0'}
  >
    {item.actionLabel}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
  </Link>
);

const Dashboard = () => {
  const { user } = useAuth();
  const { isMinimal } = useWorkspaceMode();
  const { currentJobId } = useRecruitmentContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedJobId = searchParams.get('jobId') || '';

  const { data, error, loading, refetching, refetch } = useApiResource(
    (config) => getDashboardOverview(selectedJobId ? { jobId: selectedJobId } : {}, config),
    [selectedJobId],
    { keepPreviousData: true }
  );
  // Open-role summaries drive every workflow decision; the overview drives the figures.
  const { data: jobsData, error: jobsError, loading: jobsLoading, refetch: refetchJobs } = useApiResource(
    (config) => getJobsSummary({ sort: 'newest', status: 'OPEN' }, config), [], { keepPreviousData: true }
  );

  const overview = data?.data;
  const metrics = overview?.metrics;
  const scope = overview?.scope;
  const isJobScoped = Boolean(scope?.jobId);
  const threshold = overview?.strongMatchThreshold ?? 80;
  // Closed roles never belong in active work, whatever the response contains.
  const jobs = useMemo(() => (jobsData?.data || []).filter((job) => job.status !== 'CLOSED'), [jobsData]);
  const firstName = (user?.name || '').split(' ')[0] || 'there';

  // One shared helper decides the recommendation, the attention queue and each role's action.
  const attentionItems = useMemo(() => deriveAttentionItems(jobs, threshold), [jobs, threshold]);
  const scopedJob = isJobScoped ? jobs.find((job) => job.id === scope.jobId) : null;
  const scopedAction = scopedJob ? deriveNextAction(scopedJob, threshold) : null;
  const recommended = isJobScoped ? (scopedAction && { ...scopedAction, job: scopedJob }) : attentionItems[0];
  const attention = attentionItems.slice(1, 4);
  const roles = jobs.slice(0, 5).map((job) => ({ job, action: deriveNextAction(job, threshold) }));
  const continueJob = !isJobScoped && currentJobId ? jobs.find((job) => job.id === currentJobId) : null;

  const scoredTotal = overview?.scoreBands?.reduce((sum, band) => sum + band.count, 0) || 0;
  const firstLoad = (loading && !overview) || (jobsLoading && !jobsData);
  const noOpenRoles = Boolean(jobsData) && jobs.length === 0 && !selectedJobId;
  const ready = Boolean(overview) && Boolean(jobsData) && !noOpenRoles;

  const candidatesLink = (query) => (isJobScoped ? `/jobs/${scope.jobId}/candidates?${query}` : `/candidates?${query}`);

  const snapshot = metrics ? (isJobScoped ? [
    { label: 'Candidates', value: metrics.totalCandidates, context: 'In this role', to: candidatesLink('sort=score_desc') },
    { label: 'Strong matches', value: metrics.strongMatch, context: `${threshold}% match or higher`, to: candidatesLink(`minScore=${threshold}&sort=score_desc`) },
    { label: 'Awaiting review', value: metrics.pendingReview, context: 'Review and second look', to: candidatesLink('hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc') },
    { label: 'Shortlisted', value: metrics.shortlisted, context: 'Selected by recruiters', to: candidatesLink('hrStatus=SHORTLISTED&sort=score_desc') }
  ] : [
    { label: 'Open jobs', value: metrics.openJobs ?? jobs.length, context: 'Currently hiring', to: '/jobs' },
    { label: 'Active candidates', value: metrics.totalCandidates, context: 'On open roles', to: '/candidates?sort=score_desc' },
    { label: 'Strong matches', value: metrics.strongMatch, context: `${threshold}% match or higher`, to: `/candidates?minScore=${threshold}&sort=score_desc` },
    { label: 'Shortlisted', value: metrics.shortlisted, context: 'Selected by recruiters', to: '/candidates?hrStatus=SHORTLISTED&sort=score_desc' }
  ]) : [];

  const setScope = (jobId) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (jobId) next.set('jobId', jobId);
    else next.delete('jobId');
    return next;
  }, { replace: true });

  // Minimal Mode keeps its own work-queue home, fed by the same data and helper.
  if (isMinimal) {
    return (
      <WorkspacePage>
        {jobsError && <InlineAlert tone="error" title="Couldn't load your roles" message={jobsError.message} />}
        <MinimalHome attentionItems={attentionItems} metrics={metrics} threshold={threshold}
          jobsPending={jobsLoading && !jobsData} hasLoadedJobs={Boolean(jobsData)} openJobCount={metrics?.openJobs ?? jobs.length} />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage className="dashboard !space-y-4 sm:!space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
        <div className="min-w-0">
          <p className="text-label text-slate-600">Recruitment dashboard</p>
          <h1 className="text-page-title sm:text-display mt-1 break-words">{greeting()}, {firstName}</h1>
          <p className="text-meta text-slate-600 mt-1">
            {isJobScoped
              ? `Viewing ${scope.jobTitle} on its own.`
              : ready && metrics
                ? `${metrics.pendingReview ?? 0} awaiting review across ${plural(metrics.openJobs ?? jobs.length, 'open role')}.`
                : 'Your recruitment work at a glance.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {jobs.length > 1 && (
            <>
              <label htmlFor="dashboard-scope" className="sr-only">Focus the dashboard on one role</label>
              <select id="dashboard-scope" className="select text-meta min-h-11 min-w-[11rem]" value={selectedJobId}
                onChange={(event) => setScope(event.target.value)}>
                <option value="">All open roles</option>
                {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
              </select>
            </>
          )}
          {overview?.generatedAt && <span className="text-xs text-slate-600">Updated {formatRelativeTime(overview.generatedAt)}</span>}
          <Button variant="ghost" size="lg" icon={RefreshCw} loading={refetching} disabled={firstLoad}
            onClick={() => { refetch(); refetchJobs(); }}>Refresh</Button>
          {/* Navigation has no Create job entry on this branch; secondary so the recommendation stays the one primary CTA. */}
          {!noOpenRoles && <Link to="/jobs/new" className="btn btn-lg btn-secondary"><Plus className="w-4 h-4" aria-hidden="true" />Create job</Link>}
        </div>
      </header>

      {isJobScoped && (
        <div className="flex items-center gap-2 rounded-control border border-brand-200 bg-brand-50 px-3 py-1">
          <Briefcase className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" />
          <p className="text-meta text-slate-700 min-w-0 flex-1 truncate">Filtered to <strong className="text-slate-900">{scope.jobTitle}</strong></p>
          <Button variant="ghost" size="sm" icon={X} className="min-h-11" onClick={() => setScope('')}>Show all roles</Button>
        </div>
      )}

      {error && <ErrorState title={overview ? 'Refresh failed — showing the last loaded snapshot' : 'Unable to load your dashboard'} error={error} onRetry={refetch} />}
      {jobsError && <InlineAlert tone="error" title="Couldn't load your roles" message={`${jobsError.message} Workflow sections are unavailable until it loads.`} />}

      {firstLoad && !error && (
        <div role="status" aria-label="Loading dashboard" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-28" /><Skeleton className="h-44" />
        </div>
      )}

      {noOpenRoles && (
        <EmptyState icon={Briefcase} title="No hiring activity yet" description="Create your first role to start reviewing candidates."
          action={<Link to="/jobs/new" className="btn btn-lg btn-primary">Create Job</Link>} />
      )}

      {ready && <>
        <section aria-labelledby="dashboard-snapshot-heading">
          <h2 id="dashboard-snapshot-heading" className="section-title mb-3">Recruitment snapshot</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {snapshot.map((stat) => (
              <Link key={stat.label} to={stat.to} className="dashboard-stat" aria-label={`${stat.label}: ${stat.value ?? 0}`}>
                <p className="text-meta font-medium text-slate-600">{stat.label}</p>
                <p className="text-metric mt-1 tabular-nums text-slate-900">{(stat.value ?? 0).toLocaleString('en-IN')}</p>
                <p className="text-xs text-slate-600 mt-1">{stat.context}</p>
              </Link>
            ))}
          </div>
        </section>

        <div className={`grid grid-cols-1 gap-4 ${isJobScoped ? '' : 'xl:grid-cols-5'}`}>
          <section aria-labelledby="dashboard-recommended-heading" className="xl:col-span-2">
            <Card padding="p-4" className="dashboard-panel h-full flex flex-col">
              <h2 id="dashboard-recommended-heading" className="section-title mb-2">Recommended next step</h2>
              {/* Side by side with Needs attention on wide screens, the CTA sits at the card foot. */}
              {recommended ? <div className={`flex flex-1 flex-col sm:flex-row sm:items-center justify-between gap-3 ${isJobScoped ? '' : 'xl:flex-col xl:items-start'}`}>
                <div className="min-w-0">
                  <h3 className="text-card-title break-words">{recommended.job.title}</h3>
                  <p className="text-meta text-slate-600 mt-1">{recommended.fact} {recommended.detail}</p>
                </div>
                <WorkflowLink item={recommended} primary />
              </div> : <p className="text-meta text-slate-600">Nothing needs a decision right now.</p>}
            </Card>
          </section>

          {!isJobScoped && (
            <section aria-labelledby="dashboard-attention-heading" className="xl:col-span-3">
              <Card padding="p-4" className="dashboard-panel h-full">
                <h2 id="dashboard-attention-heading" className="section-title mb-1">Needs attention</h2>
                {attention.length ? <ul className="divide-y divide-slate-200">
                  {attention.map((item) => <li key={item.job.id} className="flex flex-wrap items-center justify-between gap-x-4 py-2">
                    <div className="min-w-0 flex-1 basis-44">
                      <h3 className="text-meta font-semibold text-slate-900 break-words">{item.job.title}</h3>
                      <p className="text-xs text-slate-600 mt-0.5">{item.fact} {item.detail}</p>
                    </div>
                    <WorkflowLink item={item} />
                  </li>)}
                </ul> : <p className="text-meta text-slate-600 py-2">Nothing else needs attention right now.</p>}
              </Card>
            </section>
          )}
        </div>

        {!isJobScoped && (
          <section aria-labelledby="dashboard-roles-heading">
            <Card padding="p-4" className="dashboard-panel">
              <SectionHeader id="dashboard-roles-heading" title="Hiring roles" to="/jobs" linkLabel="View all jobs" />
              <p className="text-xs text-slate-600 mb-2">Recent open roles and their review progress.</p>
              <ul className="divide-y divide-slate-200">
                {roles.map(({ job, action }, index) => <li key={job.id} className={`py-2 flex-col sm:flex-row sm:items-center gap-x-4 ${index > 2 ? 'hidden sm:flex' : 'flex'}`}>
                  <Link to={`/jobs/${job.id}`} className="min-w-0 flex-1 min-h-11 flex flex-col justify-center rounded-control hover:bg-slate-50" aria-label={`Open job: ${job.title}`}>
                    <h3 className="text-meta font-semibold text-slate-900 break-words">{job.title}</h3>
                    <p className="text-xs text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{plural(job.candidateCount || 0, 'candidate')}</span>
                      <span>{(job.pendingReviewCount || 0).toLocaleString('en-IN')} awaiting review</span>
                      <span>{job.bestMatchScore == null ? 'Not scored yet' : `Best match ${Math.round(job.bestMatchScore)}%`}</span>
                    </p>
                  </Link>
                  {action && <div><WorkflowLink item={{ ...action, job }} /></div>}
                </li>)}
              </ul>
            </Card>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <section aria-labelledby="dashboard-pipeline-heading">
            <Card padding="p-4" className="dashboard-panel">
              <SectionHeader id="dashboard-pipeline-heading" title="Hiring pipeline" to={candidatesLink('sort=score_desc')} linkLabel="View all candidates" />
              {overview.pipeline?.some((stage) => stage.count > 0) ? <ul>
                {overview.pipeline.map((stage) => <li key={stage.key}>
                  <Link to={candidatesLink(`hrStatus=${stage.key}&sort=score_desc`)} className="block min-h-11 py-2 rounded-control hover:bg-slate-50" aria-label={`${stage.label}: ${stage.count} candidates`}>
                    <div className="flex items-center justify-between gap-3 text-meta text-slate-900"><span>{stage.label}</span><span className="tabular-nums">{stage.count} <span className="text-xs text-slate-600">({stage.percentage}%)</span></span></div>
                    <div className="dashboard-track mt-1.5"><div className="bg-brand-600 h-full rounded-pill" style={{ width: `${stage.percentage}%` }} /></div>
                  </Link>
                </li>)}
              </ul> : <p className="text-meta text-slate-600 py-2">Add candidates to a role to begin reviewing.</p>}
            </Card>
          </section>
          <section aria-labelledby="dashboard-quality-heading">
            <Card padding="p-4" className="dashboard-panel">
              <h2 id="dashboard-quality-heading" className="section-title mb-2">Match quality</h2>
              <p className="text-xs text-slate-600 mb-1">Strong matches start at {threshold}%. Scores support recruiter decisions.</p>
              {scoredTotal > 0 ? <ul>
                {overview.scoreBands.map((band) => <li key={band.key}>
                  <Link to={candidatesLink(`minScore=${band.min}${band.max < 100 ? `&maxScore=${band.max}` : ''}&sort=score_desc`)} className="flex min-h-11 items-center gap-3 rounded-control text-xs text-slate-900 hover:bg-slate-50" aria-label={`${band.label}: ${band.count} candidates`}>
                    <span className="w-20 shrink-0">{band.label}</span>
                    <span className="dashboard-track flex-1"><span className="block h-full rounded-pill bg-brand-600" style={{ width: `${Math.round(band.count / scoredTotal * 100)}%` }} /></span>
                    <span className="tabular-nums w-8 text-right">{band.count}</span>
                  </Link>
                </li>)}
              </ul> : <p className="text-meta text-slate-600 py-2">No scored candidates yet. Use the role workspace to review scoring.</p>}
            </Card>
          </section>
        </div>

        {continueJob && (
          <section aria-labelledby="continue-work-heading">
            <Card padding="p-4" className="dashboard-panel flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 id="continue-work-heading" className="section-title">Continue where you left off</h2>
                <p className="text-meta text-slate-600 mt-0.5 break-words">{continueJob.title} · {plural(continueJob.candidateCount || 0, 'candidate')}</p>
              </div>
              <Link to={`/jobs/${continueJob.id}/candidates`} className="dashboard-link shrink-0" aria-label={`Continue reviewing ${continueJob.title}`}>
                Continue review<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </Card>
          </section>
        )}

        <section aria-labelledby="dashboard-recent-heading">
          <Card padding="p-0" className="dashboard-panel">
            <div className="px-4 pt-3"><SectionHeader id="dashboard-recent-heading" title="Recent candidates" to={candidatesLink('sort=newest')} linkLabel="View all candidates" /></div>
            {overview.recentCandidates?.length ? <ul className="divide-y divide-slate-200">
              {overview.recentCandidates.slice(0, 5).map((candidate, index) => <li key={candidate.id || candidate._id} className={index > 2 ? 'hidden sm:block' : ''}><CandidateRow candidate={candidate} /></li>)}
            </ul> : <p className="text-meta text-slate-600 px-4 pb-4">New candidates will appear here after import.</p>}
          </Card>
        </section>
      </>}
    </WorkspacePage>
  );
};

export default Dashboard;
