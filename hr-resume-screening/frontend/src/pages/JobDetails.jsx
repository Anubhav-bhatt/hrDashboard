import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Award,
  Briefcase,
  Calendar,
  Clock,
  FileText,
  GraduationCap,
  IndianRupee,
  MapPin,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  CheckCircle2,
  Lock,
  UserCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import {
  analyzeAllCandidates,
  closeJob,
  getCandidates,
  getJobById,
  getJobShortlist,
  getJobSummary,
  toApiError,
  updateJobCriteria
} from '../services/api';
import CloseJobDialog from '../components/jobs/CloseJobDialog';
import { useApiResource } from '../hooks/useApiResource';
import { useToast } from '../components/ToastProvider';
import TopCandidates from '../components/dashboard/TopCandidates';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineAlert,
  JobStatusBadge,
  PageHeader,
  Skeleton,
  SkillChip,
  TabPanel,
  Tabs,
  cx
} from '../components/ui';
import TokenInput from '../components/ui/TokenInput';
import CandidateBrowser from '../components/candidate/CandidateBrowser';
import { formatDate, formatExperience, formatSalary } from '../utils/format';

/** The three things a recruiter comes to a job page for. */
const JOB_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'criteria', label: 'Job criteria' }
];

const SKILL_SUGGESTIONS = [
  'React', 'TypeScript', 'JavaScript', 'Node.js', 'Express', 'PostgreSQL', 'MongoDB',
  'Python', 'Java', 'Spring Boot', 'AWS', 'Docker', 'Kubernetes', 'REST API', 'GraphQL'
];
const LOCATION_SUGGESTIONS = ['Gurugram', 'Noida', 'Delhi', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Remote'];
const QUALIFICATION_SUGGESTIONS = ['B.Tech', 'B.E.', 'M.Tech', 'BCA', 'MCA', 'B.Sc', 'MBA', 'Diploma'];

const STATUS_META = {
  COMPLETED: { label: 'All scored', variant: 'success' },
  READY_FOR_ANALYSIS: { label: 'Ready to score', variant: 'warning' },
  IMPORTING: { label: 'Importing', variant: 'info' },
  NEW: { label: 'New', variant: 'neutral' }
};

/** Compact KPI tile for the candidate snapshot. */
const SnapshotTile = ({ label, value, icon: Icon, tone = 'slate', to, hint }) => {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    slate: 'bg-slate-100 text-slate-600'
  };

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-label uppercase text-slate-500">{label}</p>
        {Icon && (
          <span className={cx('w-7 h-7 rounded-control flex items-center justify-center shrink-0', tones[tone])}>
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-slate-900 mt-1.5 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </>
  );

  if (!to) return <div className="rounded-card border border-slate-200 bg-white px-4 py-3">{body}</div>;

  return (
    <Link
      to={to}
      className="rounded-card border border-slate-200 bg-white px-4 py-3 transition duration-fast
                 hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2
                 focus-visible:ring-offset-slate-50 block"
      aria-label={`${label}: ${value}`}
    >
      {body}
    </Link>
  );
};

/** Read-only criterion row used by the view state. */
const CriterionRow = ({ icon: Icon, label, children, empty }) => (
  <div className="py-2.5">
    <p className="text-label uppercase text-slate-500 inline-flex items-center gap-1.5">
      {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />}
      {label}
    </p>
    <div className="mt-1.5">
      {empty ? <p className="text-meta text-slate-400 italic">Not set</p> : children}
    </div>
  </div>
);

/**
 * Job control centre.
 *
 * The operational home for one vacancy: what the role is, how its pipeline is
 * doing, who the strongest candidates are, what it screens for, and what to do
 * next. Screening criteria are read-only until explicitly edited, so the page
 * reads as a dashboard rather than a permanently open form.
 */
const JobDetails = () => {
  const { id } = useParams();
  const toast = useToast();

  const { data: jobData, error, loading, refetch } = useApiResource((config) => getJobById(id, config), [id]);
  const { data: summaryData, refetch: refetchSummary } = useApiResource(
    (config) => getJobSummary(id, config),
    [id]
  );
  const { data: topData } = useApiResource(
    (config) => getCandidates(id, { sort: 'score_desc', limit: 5, minScore: 0 }, config),
    [id]
  );

  const job = jobData?.data;
  const stats = summaryData?.data?.stats;
  const threshold = summaryData?.data?.strongMatchThreshold ?? 80;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [draft, setDraft] = useState(null);

  // The active tab and the JD disclosure. The tab is mirrored into the URL so a
  // link can point at a job's criteria or candidates directly.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = JOB_TABS.some((tab) => tab.id === requestedTab) ? requestedTab : 'overview';
  const [jdOpen, setJdOpen] = useState(false);

  const setTab = (next) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'overview') params.delete('tab');
        else params.set('tab', next);
        return params;
      },
      { replace: true }
    );
  };

  // Job closure
  const isClosed = job?.status === 'CLOSED';
  const shortlistedCount = stats?.shortlistedCount ?? job?.shortlistedCount ?? 0;
  const canClose = !isClosed && shortlistedCount > 0;
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [shortlist, setShortlist] = useState([]);
  const [loadingShortlist, setLoadingShortlist] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');

  /** Loads the shortlist on demand, so an unopened dialog costs nothing. */
  const openCloseDialog = async () => {
    setCloseError('');
    setLoadingShortlist(true);
    try {
      const response = await getJobShortlist(id);
      const candidates = response?.data || [];
      if (candidates.length === 0) {
        toast.error('Shortlist at least one candidate before closing this job.');
        return;
      }
      setShortlist(candidates);
      setCloseDialogOpen(true);
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setLoadingShortlist(false);
    }
  };

  const confirmClose = async (selectedCandidateId) => {
    setClosing(true);
    setCloseError('');
    try {
      const response = await closeJob(id, selectedCandidateId);
      const hire = response?.data?.selectedCandidate;
      setCloseDialogOpen(false);
      toast.success(
        hire?.name
          ? `Job closed. ${hire.name} was selected for ${job.title}.`
          : 'Job closed successfully.'
      );
      // Reload so the page renders its closed state from the server rather than
      // from an assumption about what the write did.
      refetch();
      refetchSummary();
    } catch (err) {
      setCloseError(toApiError(err).message);
    } finally {
      setClosing(false);
    }
  };

  // The editable copy is seeded from the server whenever the job (re)loads.
  useEffect(() => {
    if (!job) return;
    const reqs = job.requirements || {};
    setDraft({
      requiredSkills: reqs.requiredSkills || [],
      preferredSkills: reqs.preferredSkills || [],
      searchKeywords: reqs.searchKeywords || [],
      preferredLocations: reqs.preferredLocations || [],
      qualifications: reqs.qualifications || [],
      minimumExperience: reqs.minimumExperience ?? 0,
      maximumExperience: reqs.maximumExperience ?? '',
      salaryMin: reqs.salaryMin ?? '',
      salaryMax: reqs.salaryMax ?? '',
      salaryCurrency: reqs.salaryCurrency || 'INR'
    });
  }, [job]);

  const reqs = job?.requirements || {};
  const status = STATUS_META[summaryData?.data ? deriveStatus(stats) : 'NEW'] || STATUS_META.NEW;

  const topCandidates = useMemo(
    () => (topData?.data || []).filter((c) => c.matchAnalysis?.overallScore !== undefined),
    [topData]
  );

  const update = (changes) => {
    setDraft((prev) => ({ ...prev, ...changes }));
    setValidationError('');
  };

  const handleSave = async () => {
    const minE = draft.minimumExperience === '' ? 0 : parseFloat(draft.minimumExperience);
    const maxE = draft.maximumExperience === '' ? null : parseFloat(draft.maximumExperience);
    const salMin = draft.salaryMin === '' ? null : parseFloat(draft.salaryMin);
    const salMax = draft.salaryMax === '' ? null : parseFloat(draft.salaryMax);

    if (Number.isNaN(minE) || minE < 0) return setValidationError('Minimum experience must be zero or greater.');
    if (maxE !== null && (Number.isNaN(maxE) || maxE < minE)) {
      return setValidationError('Maximum experience cannot be less than the minimum.');
    }
    if (salMin !== null && (Number.isNaN(salMin) || salMin < 0)) {
      return setValidationError('Minimum salary cannot be negative.');
    }
    if (salMax !== null && salMin !== null && salMax < salMin) {
      return setValidationError('Maximum salary cannot be less than the minimum.');
    }

    setSaving(true);
    try {
      await updateJobCriteria(id, {
        requiredSkills: draft.requiredSkills,
        preferredSkills: draft.preferredSkills,
        searchKeywords: draft.searchKeywords,
        preferredLocations: draft.preferredLocations,
        qualifications: draft.qualifications,
        minimumExperience: minE,
        maximumExperience: maxE,
        salaryMin: salMin,
        salaryMax: salMax,
        salaryCurrency: draft.salaryCurrency
      });
      await refetch();
      setEditing(false);
      toast.success(
        stats?.analyzedCount > 0
          ? 'Criteria saved. Re-score candidates to apply the new requirements.'
          : 'Screening criteria saved.'
      );
    } catch (err) {
      setValidationError(toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const handleReanalyze = async () => {
    setAnalyzing(true);
    try {
      const response = await analyzeAllCandidates(id);
      await Promise.all([refetch(), refetchSummary()]);
      toast.success(`Re-scored ${response.data?.analyzed ?? 0} candidate${response.data?.analyzed === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setAnalyzing(false);
    }
  };

  /* -------------------------------------------------------------- states --- */

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5">
        <Link to="/jobs" className="text-meta font-medium text-slate-500 hover:text-slate-900">
          ← All jobs
        </Link>
        {error.status === 404 ? (
          <EmptyState
            icon={Briefcase}
            title="Job not found"
            description="This job does not exist or has been deleted."
            action={
              <Link to="/jobs" className="btn btn-sm btn-primary">
                Back to jobs
              </Link>
            }
          />
        ) : (
          <ErrorState title="Unable to load this job" error={error} onRetry={refetch} />
        )}
      </div>
    );
  }

  if (!job || !draft) return null;

  const hasCandidates = (stats?.candidateCount ?? 0) > 0;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-meta text-slate-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/jobs" className="hover:text-slate-900 transition-colors duration-fast font-medium">
              Jobs
            </Link>
          </li>
          <li aria-hidden="true" className="text-slate-300">/</li>
          <li className="text-slate-900 font-semibold truncate max-w-[20rem]" aria-current="page">
            {job.title}
          </li>
        </ol>
      </nav>

      <PageHeader
        eyebrow="Job control centre"
        title={job.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              {job.jdFileName}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              Created {formatDate(job.createdAt)}
            </span>
            <JobStatusBadge status={job.status} />
            {!isClosed && <Badge variant={status.variant}>{status.label}</Badge>}
          </span>
        }
        actions={
          /*
            One dominant action, chosen from the job's real state:
            no candidates yet -> add some; a shortlist exists -> make the hiring
            decision; otherwise -> look at the candidates. A closed job offers
            nothing operational at all.
          */
          isClosed ? (
            job.selectedCandidate && (
              <Link to={`/jobs/${id}/candidates/${job.selectedCandidate.id}`} className="btn btn-md btn-primary">
                <Users className="w-4 h-4" aria-hidden="true" />
                View selected candidate
              </Link>
            )
          ) : (
            <>
              {!hasCandidates ? (
                <Link to={`/jobs/${id}/import`} className="btn btn-md btn-primary">
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  Add candidates
                </Link>
              ) : (
                <>
                  <Link to={`/jobs/${id}/import`} className="btn btn-md btn-secondary">
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                    Add candidates
                  </Link>
                  <Link to={`/ai/ranking?jobId=${id}`} className="btn btn-md btn-secondary text-indigo-700 border-indigo-200">
                    <Sparkles className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                    Rank (AI)
                  </Link>
                  {canClose ? (
                    // Phrased as the decision the recruiter is making, not as the
                    // administrative act of closing a record.
                    <Button variant="primary" onClick={openCloseDialog} loading={loadingShortlist} icon={CheckCircle2}>
                      Select final candidate
                    </Button>
                  ) : (
                    <Link to={`/jobs/${id}/candidates`} className="btn btn-md btn-primary">
                      <Users className="w-4 h-4" aria-hidden="true" />
                      View candidates
                    </Link>
                  )}
                </>
              )}
            </>
          )
        }
      />

      {!isClosed && hasCandidates && shortlistedCount === 0 && (
        <p className="text-meta text-slate-500 -mt-2">
          Shortlist candidates you want to consider, then select the one you hire.
        </p>
      )}

      {/* Closed-job banner: what happened, who was hired, and a way to them. */}
      {isClosed && (
        <section
          aria-label="Job closed"
          className="rounded-card border border-brand-200 bg-brand-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
        >
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-2 text-meta font-semibold text-brand-700">
              <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
              This job is closed
            </p>
            <p className="text-body text-slate-700 mt-1">
              Filled on {formatDate(job.closedAt)}. Candidate imports and re-analysis are disabled; all history
              remains available.
            </p>
          </div>

          {job.selectedCandidate && (
            <div className="shrink-0 flex items-center gap-3 rounded-control bg-white border border-brand-200 p-3">
              <Avatar name={job.selectedCandidate.name} size="md" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Selected candidate</p>
                <p className="text-body font-medium text-slate-900 truncate">{job.selectedCandidate.name}</p>
                {job.selectedCandidate.overallScore !== null && job.selectedCandidate.overallScore !== undefined && (
                  <p className="text-meta text-slate-600 tabular-nums">
                    {Math.round(job.selectedCandidate.overallScore)}% job match
                  </p>
                )}
              </div>
              <Link
                to={`/jobs/${id}/candidates/${job.selectedCandidate.id}`}
                className="btn btn-sm btn-secondary shrink-0"
              >
                View candidate
              </Link>
            </div>
          )}
        </section>
      )}

      {closeDialogOpen && (
        <CloseJobDialog
          jobTitle={job.title}
          candidates={shortlist}
          submitting={closing}
          error={closeError}
          onConfirm={confirmClose}
          onClose={() => {
            setCloseDialogOpen(false);
            setCloseError('');
          }}
        />
      )}

      {/* Candidate snapshot — values come from the job summary API */}
      <section aria-label="Candidate snapshot" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SnapshotTile
          label="Candidates"
          value={stats?.candidateCount ?? '—'}
          icon={Users}
          tone="brand"
          to={`/jobs/${id}/candidates`}
        />
        <SnapshotTile
          label={`${threshold}%+ matches`}
          value={stats?.strongMatchCount ?? '—'}
          icon={Award}
          tone="emerald"
          to={`/jobs/${id}/candidates?minScore=${threshold}&sort=score_desc`}
          hint="Strong alignment"
        />
        <SnapshotTile
          label="Shortlisted"
          value={stats?.shortlistedCount ?? '—'}
          icon={UserCheck}
          tone="emerald"
          to={`/jobs/${id}/candidates?hrStatus=SHORTLISTED`}
        />
        <SnapshotTile
          label="Best match"
          value={stats?.bestMatchScore === null || stats?.bestMatchScore === undefined ? '—' : `${stats.bestMatchScore}%`}
          icon={Sparkles}
          tone="violet"
          hint={stats?.averageMatchScore !== null && stats?.averageMatchScore !== undefined ? `Average ${stats.averageMatchScore}%` : 'Not scored yet'}
        />
      </section>

      {/* Stale-analysis prompt */}
      {hasCandidates && stats.analyzedCount < stats.candidateCount && (
        <InlineAlert
          tone="warning"
          title="Some candidates are not scored"
          message={`${stats.candidateCount - stats.analyzedCount} candidate(s) on this role have not been scored against the current criteria.`}
        />
      )}

      {/*
        Three tabs, and only three.
        Everything this page can do belongs to one of them: what is happening
        (Overview), who applied (Candidates), or what the role screens for (Job
        Criteria). The active tab lives in the URL so a particular view of a job
        can be refreshed and shared.
      */}
      <Tabs tabs={JOB_TABS} activeId={activeTab} onChange={setTab} />

      {/* ------------------------------------------------------- Job criteria --- */}
      <TabPanel id="criteria" activeId={activeTab}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
          {/* Screening criteria — view state by default */}
          <Card padding="p-0">
            <div className="px-5 py-4 border-b border-slate-100">
              <CardHeader
                title="Screening criteria"
                description="What this role screens for. Drives every candidate's relevance score."
                actions={
                  editing ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={X}
                        onClick={() => {
                          setEditing(false);
                          setValidationError('');
                          // Discard the draft by re-seeding from the server copy.
                          const r = job.requirements || {};
                          setDraft({
                            requiredSkills: r.requiredSkills || [],
                            preferredSkills: r.preferredSkills || [],
                            searchKeywords: r.searchKeywords || [],
                            preferredLocations: r.preferredLocations || [],
                            qualifications: r.qualifications || [],
                            minimumExperience: r.minimumExperience ?? 0,
                            maximumExperience: r.maximumExperience ?? '',
                            salaryMin: r.salaryMin ?? '',
                            salaryMax: r.salaryMax ?? '',
                            salaryCurrency: r.salaryCurrency || 'INR'
                          });
                        }}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" icon={Save} loading={saving} onClick={handleSave}>
                        Save changes
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(true)}>
                      Edit criteria
                    </Button>
                  )
                }
              />
            </div>

            <div className="p-5">
              {validationError && <InlineAlert tone="error" message={validationError} className="mb-4" />}

              {editing ? (
                <div className="space-y-6 animate-fade-in">
                  <TokenInput
                    id="jd-required"
                    label="Required skills"
                    description="Worth 40 of the 100 score points."
                    values={draft.requiredSkills}
                    onChange={(v) => update({ requiredSkills: v })}
                    suggestions={SKILL_SUGGESTIONS}
                    addLabel="Add skill"
                    disabled={saving}
                  />
                  <TokenInput
                    id="jd-preferred"
                    label="Preferred skills"
                    description="Worth 10 points."
                    values={draft.preferredSkills}
                    onChange={(v) => update({ preferredSkills: v })}
                    suggestions={SKILL_SUGGESTIONS}
                    addLabel="Add skill"
                    disabled={saving}
                  />
                  <TokenInput
                    id="jd-keywords"
                    label="Domain keywords"
                    description="Searched across resume content."
                    values={draft.searchKeywords}
                    onChange={(v) => update({ searchKeywords: v })}
                    addLabel="Add keyword"
                    tone="keyword"
                    disabled={saving}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 divider">
                    <TokenInput
                      id="jd-locations"
                      label="Preferred locations"
                      values={draft.preferredLocations}
                      onChange={(v) => update({ preferredLocations: v })}
                      suggestions={LOCATION_SUGGESTIONS}
                      addLabel="Add location"
                      disabled={saving}
                    />
                    <TokenInput
                      id="jd-qualifications"
                      label="Qualifications"
                      values={draft.qualifications}
                      onChange={(v) => update({ qualifications: v })}
                      suggestions={QUALIFICATION_SUGGESTIONS}
                      addLabel="Add qualification"
                      disabled={saving}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 divider">
                    <div>
                      <p className="text-meta font-semibold text-slate-900">Experience (years)</p>
                      <div className="grid grid-cols-2 gap-3 mt-2.5">
                        <div>
                          <label htmlFor="min-exp" className="field-label">Minimum</label>
                          <input
                            id="min-exp"
                            type="number"
                            min="0"
                            step="0.5"
                            className="input h-9"
                            value={draft.minimumExperience}
                            onChange={(e) => update({ minimumExperience: e.target.value })}
                            disabled={saving}
                          />
                        </div>
                        <div>
                          <label htmlFor="max-exp" className="field-label">Maximum</label>
                          <input
                            id="max-exp"
                            type="number"
                            min="0"
                            step="0.5"
                            className="input h-9"
                            placeholder="No limit"
                            value={draft.maximumExperience}
                            onChange={(e) => update({ maximumExperience: e.target.value })}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-meta font-semibold text-slate-900">Annual salary band</p>
                      <div className="grid grid-cols-2 gap-3 mt-2.5">
                        <div>
                          <label htmlFor="sal-min" className="field-label">Minimum</label>
                          <input
                            id="sal-min"
                            type="number"
                            min="0"
                            step="50000"
                            className="input h-9"
                            placeholder="600000"
                            value={draft.salaryMin}
                            onChange={(e) => update({ salaryMin: e.target.value })}
                            disabled={saving}
                          />
                        </div>
                        <div>
                          <label htmlFor="sal-max" className="field-label">Maximum</label>
                          <input
                            id="sal-max"
                            type="number"
                            min="0"
                            step="50000"
                            className="input h-9"
                            placeholder="1200000"
                            value={draft.salaryMax}
                            onChange={(e) => update({ salaryMax: e.target.value })}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* View state — a readable summary, not a form */
                <div className="divide-y divide-slate-100">
                  <CriterionRow icon={Sparkles} label="Required skills" empty={!reqs.requiredSkills?.length}>
                    <div className="flex flex-wrap gap-1.5">
                      {(reqs.requiredSkills || []).map((s) => (
                        <SkillChip key={s}>{s}</SkillChip>
                      ))}
                    </div>
                  </CriterionRow>

                  <CriterionRow icon={Sparkles} label="Preferred skills" empty={!reqs.preferredSkills?.length}>
                    <div className="flex flex-wrap gap-1.5">
                      {(reqs.preferredSkills || []).map((s) => (
                        <SkillChip key={s}>{s}</SkillChip>
                      ))}
                    </div>
                  </CriterionRow>

                  <CriterionRow icon={Search} label="Domain keywords" empty={!reqs.searchKeywords?.length}>
                    <div className="flex flex-wrap gap-1.5">
                      {(reqs.searchKeywords || []).map((k) => (
                        <SkillChip key={k} keyword>
                          {k}
                        </SkillChip>
                      ))}
                    </div>
                  </CriterionRow>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                    <CriterionRow icon={Briefcase} label="Experience">
                      <p className="text-body text-slate-900 font-medium">
                        {reqs.maximumExperience
                          ? `${reqs.minimumExperience ?? 0} – ${reqs.maximumExperience} years`
                          : `${reqs.minimumExperience ?? 0}+ years`}
                      </p>
                    </CriterionRow>

                    <CriterionRow
                      icon={IndianRupee}
                      label="Salary band"
                      empty={reqs.salaryMin === null && reqs.salaryMax === null}
                    >
                      <p className="text-body text-slate-900 font-medium">
                        {formatSalary(reqs.salaryMin, reqs.salaryCurrency, 'Any')} –{' '}
                        {formatSalary(reqs.salaryMax, reqs.salaryCurrency, 'Any')}
                      </p>
                    </CriterionRow>

                    <CriterionRow icon={MapPin} label="Preferred locations" empty={!reqs.preferredLocations?.length}>
                      <div className="flex flex-wrap gap-1.5">
                        {(reqs.preferredLocations || []).map((l) => (
                          <SkillChip key={l}>{l}</SkillChip>
                        ))}
                      </div>
                    </CriterionRow>

                    <CriterionRow icon={GraduationCap} label="Qualifications" empty={!reqs.qualifications?.length}>
                      <div className="flex flex-wrap gap-1.5">
                        {(reqs.qualifications || []).map((q) => (
                          <SkillChip key={q}>{q}</SkillChip>
                        ))}
                      </div>
                    </CriterionRow>
                  </div>
                </div>
              )}
            </div>

            {/* Re-scoring is withheld on a closed job: the scores that informed
                the hiring decision must stay as they were. */}
            {hasCandidates && stats.analyzedCount > 0 && !editing && !isClosed && (
              <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-meta text-slate-600">
                  Changed the criteria? Re-score so rankings reflect the current requirements.
                </p>
                <Button variant="secondary" size="sm" icon={RefreshCw} loading={analyzing} onClick={handleReanalyze}>
                  Re-score all
                </Button>
              </div>
            )}

            {isClosed && (
              <div className="px-5 py-4 border-t border-slate-200 bg-slate-50">
                <p className="text-meta text-slate-600">
                  This job is closed. Scores are preserved as they were when the hiring decision was made.
                </p>
              </div>
            )}
          </Card>

          </div>

          {/* Reference material for whoever is editing the criteria. */}
          <div className="space-y-5">
            <Card>
              <CardHeader title="What this affects" />
              <p className="text-meta text-slate-600 mt-2">
                These criteria decide every candidate's job match. Changing them does not re-score anyone
                automatically — use Re-score all when you are happy with the changes.
              </p>
            </Card>
          </div>
        </div>
      </TabPanel>

      {/* --------------------------------------------------------- Candidates --- */}
      <TabPanel id="candidates" activeId={activeTab}>
        {/* The same browser the dedicated candidates route uses, scoped to this
            job. One implementation of searching, filtering and ranking. */}
        <CandidateBrowser jobId={id} />
      </TabPanel>

      {/* ----------------------------------------------------------- Overview --- */}
      <TabPanel id="overview" activeId={activeTab}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Job description. Collapsed by default — a recruiter opening a job
              wants its state, not a wall of extracted text. */}
          <Card padding="p-0">
            <div className="px-5 py-4">
              <CardHeader
                title="Job description"
                description={job.jdFileName}
                actions={
                  job.jdText ? (
                    <Button variant="secondary" size="sm" onClick={() => setJdOpen((open) => !open)} aria-expanded={jdOpen}>
                      {jdOpen ? 'Hide JD' : 'View JD'}
                    </Button>
                  ) : null
                }
              />
            </div>
            {jdOpen && (
              <div className="px-5 pb-5">
                {job.jdText ? (
                  <div className="rounded-control border border-slate-200 bg-slate-50 p-4 max-h-80 overflow-y-auto scroll-slim">
                    <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                      {job.jdText}
                    </pre>
                  </div>
                ) : (
                  <p className="text-meta text-slate-400 italic">
                    Text couldn't be read from this job description file.
                  </p>
                )}
              </div>
            )}
          </Card>

          <TopCandidates
            candidates={topCandidates.slice(0, 5)}
            jobTitle={job.title}
            viewAllTo={`/jobs/${id}/candidates?sort=score_desc`}
          />
        </div>

        {/* Contextual side panel */}
        <div className="space-y-5">

          {/* Next action */}
          <Card>
            <CardHeader title="Next steps" />
            <div className="mt-3 space-y-2">
              {isClosed ? (
                <>
                  <p className="text-meta text-slate-600">
                    This role is filled. Candidate imports are disabled for closed jobs, and the full screening
                    history stays available below.
                  </p>
                  <Link to="/jobs/closed" className="btn btn-md btn-secondary w-full">
                    <Briefcase className="w-4 h-4" aria-hidden="true" />
                    View in closed jobs
                  </Link>
                </>
              ) : !hasCandidates ? (
                <>
                  <p className="text-meta text-slate-600">
                    No candidates yet. Add resumes to start comparing candidates against this job.
                  </p>
                  <Link to={`/jobs/${id}/import`} className="btn btn-md btn-primary w-full">
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                    Add candidates
                  </Link>
                </>
              ) : stats.pendingReviewCount > 0 ? (
                <>
                  <p className="text-meta text-slate-600">
                    {stats.pendingReviewCount} candidate{stats.pendingReviewCount === 1 ? '' : 's'} waiting on your
                    review.
                  </p>
                  <Link
                    to={`/jobs/${id}/candidates?hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc`}
                    className="btn btn-md btn-primary w-full"
                  >
                    <Clock className="w-4 h-4" aria-hidden="true" />
                    Review candidates
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-meta text-slate-600">Every candidate on this role has been screened.</p>
                  <Link to={`/jobs/${id}/candidates`} className="btn btn-md btn-secondary w-full">
                    <Users className="w-4 h-4" aria-hidden="true" />
                    View all candidates
                  </Link>
                </>
              )}

              {!isClosed && (
                <Link to={`/jobs/${id}/import`} className="btn btn-md btn-secondary w-full">
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  Add candidates
                </Link>
              )}
            </div>
          </Card>
        </div>
        </div>
      </TabPanel>
    </div>
  );
};

/** Mirrors the backend's derived status from candidate counts. */
function deriveStatus(stats) {
  if (!stats || stats.candidateCount === 0) return 'NEW';
  if (stats.analyzedCount === 0) return 'IMPORTING';
  if (stats.analyzedCount < stats.candidateCount) return 'READY_FOR_ANALYSIS';
  return 'COMPLETED';
}

export default JobDetails;
