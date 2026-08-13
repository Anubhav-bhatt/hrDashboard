import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Award,
  Briefcase,
  Calendar,
  Clock,
  DownloadCloud,
  FileText,
  GraduationCap,
  IndianRupee,
  MapPin,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import {
  analyzeAllCandidates,
  getCandidates,
  getJobById,
  getJobSummary,
  toApiError,
  updateJobCriteria
} from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useToast } from '../components/ToastProvider';
import TopCandidates from '../components/dashboard/TopCandidates';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineAlert,
  PageHeader,
  Skeleton,
  SkillChip,
  cx
} from '../components/ui';
import TokenInput from '../components/ui/TokenInput';
import { formatDate, formatExperience, formatSalary } from '../utils/format';

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
            <Badge variant={status.variant}>{status.label}</Badge>
          </span>
        }
        actions={
          <>
            <Link to={`/jobs/${id}/import`} className="btn btn-md btn-secondary">
              <DownloadCloud className="w-4 h-4" aria-hidden="true" />
              Import candidates
            </Link>
            <Link to={`/jobs/${id}/candidates`} className="btn btn-md btn-primary">
              <Users className="w-4 h-4" aria-hidden="true" />
              View candidates
            </Link>
          </>
        }
      />

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
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

            {hasCandidates && stats.analyzedCount > 0 && !editing && (
              <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-meta text-slate-600">
                  Changed the criteria? Re-score so rankings reflect the current requirements.
                </p>
                <Button variant="secondary" size="sm" icon={RefreshCw} loading={analyzing} onClick={handleReanalyze}>
                  Re-score all
                </Button>
              </div>
            )}
          </Card>

          {/* Job description */}
          <Card padding="p-0">
            <div className="px-5 py-4 border-b border-slate-100">
              <CardHeader
                title="Job description"
                description="Text extracted from the uploaded document."
                actions={
                  <Badge variant="neutral">{(job.jdText || '').length.toLocaleString('en-IN')} characters</Badge>
                }
              />
            </div>
            <div className="p-5">
              {job.jdText ? (
                <div className="rounded-control border border-slate-200 bg-slate-50 p-4 max-h-80 overflow-y-auto scroll-slim">
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {job.jdText}
                  </pre>
                </div>
              ) : (
                <p className="text-meta text-slate-400 italic">No text could be extracted from this job description.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Contextual side panel */}
        <div className="space-y-5">
          <TopCandidates
            candidates={topCandidates.slice(0, 5)}
            jobTitle={job.title}
            viewAllTo={`/jobs/${id}/candidates?sort=score_desc`}
          />

          {/* Next action */}
          <Card>
            <CardHeader title="Next steps" />
            <div className="mt-3 space-y-2">
              {!hasCandidates ? (
                <>
                  <p className="text-meta text-slate-600">
                    No candidates yet. Import resumes to start screening for this role.
                  </p>
                  <Link to={`/jobs/${id}/import`} className="btn btn-md btn-primary w-full">
                    <DownloadCloud className="w-4 h-4" aria-hidden="true" />
                    Import candidates
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

              <Link to={`/jobs/${id}/import`} className="btn btn-md btn-secondary w-full">
                <DownloadCloud className="w-4 h-4" aria-hidden="true" />
                Add more resumes
              </Link>
            </div>
          </Card>
        </div>
      </div>
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
