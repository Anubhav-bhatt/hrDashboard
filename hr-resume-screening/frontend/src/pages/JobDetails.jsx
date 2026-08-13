import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Briefcase,
  Calendar,
  DownloadCloud,
  FileText,
  GraduationCap,
  IndianRupee,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Users,
  X
} from 'lucide-react';
import { analyzeAllCandidates, getJobById, toApiError, updateJobCriteria } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useToast } from '../components/ToastProvider';
import StatCard from '../components/StatCard';
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
  cx
} from '../components/ui';
import { formatDate, formatSalary } from '../utils/format';

const SUGGESTIONS = {
  skill: ['React', 'TypeScript', 'JavaScript', 'Node.js', 'PostgreSQL', 'Python', 'Java', 'AWS', 'Docker', 'Kubernetes'],
  location: ['Gurugram', 'Noida', 'Delhi', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Chennai', 'Remote'],
  qualification: ['B.Tech', 'B.E.', 'M.Tech', 'BCA', 'MCA', 'B.Sc', 'MBA', 'Diploma', 'Any Graduate']
};

/** Chip list with inline add/remove, used for every array-valued criterion. */
const CriteriaChips = ({ id, label, description, icon: Icon, items, onAdd, onRemove, suggestions = [], placeholder, tone = 'neutral' }) => {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const submit = (raw) => {
    const candidate = String(raw ?? value).trim();
    if (!candidate) {
      setError('Enter a value first.');
      return;
    }
    if (items.some((item) => item.toLowerCase() === candidate.toLowerCase())) {
      setError('That entry has already been added.');
      return;
    }
    onAdd(candidate);
    setValue('');
    setError('');
    setAdding(false);
  };

  return (
    <div className="rounded-card border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-meta font-semibold text-slate-900 inline-flex items-center gap-1.5">
            {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />}
            {label}
            <span className="text-slate-400 font-normal">({items.length})</span>
          </h3>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>

        {!adding && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAdding(true)} aria-label={`Add ${label.toLowerCase()}`}>
            Add
          </Button>
        )}
      </div>

      {adding && (
        <div className="mt-3 rounded-control border border-slate-300 bg-white p-3 animate-slide-up">
          <div className="flex gap-2">
            <label htmlFor={`${id}-input`} className="sr-only">
              {label}
            </label>
            <input
              id={`${id}-input`}
              type="text"
              className={cx('input h-9', error && 'input-error')}
              placeholder={placeholder}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                } else if (e.key === 'Escape') {
                  setAdding(false);
                  setValue('');
                  setError('');
                }
              }}
              autoFocus
            />
            <Button variant="primary" size="sm" onClick={() => submit()}>
              Add
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              icon={X}
              onClick={() => {
                setAdding(false);
                setValue('');
                setError('');
              }}
              aria-label="Cancel"
            />
          </div>

          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className="text-[11px] font-semibold text-slate-400">Suggestions:</span>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="text-[11px] px-2 py-0.5 rounded-pill border border-slate-200 bg-slate-50 text-slate-600 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 transition-colors duration-fast"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-rose-600 mt-2 font-medium">{error}</p>}
        </div>
      )}

      <div className="mt-3">
        {items.length === 0 ? (
          <p className="text-xs text-slate-400 italic">None defined yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {items.map((item, index) => (
              <li key={`${item}-${index}`} className={cx('chip', tone === 'brand' && 'bg-brand-50 border-brand-200 text-brand-800')}>
                {item}
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="text-slate-400 hover:text-rose-600 transition-colors duration-fast rounded"
                  aria-label={`Remove ${item}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

/**
 * Job workspace: metrics, the search criteria that drive scoring, and the
 * extracted job-description text.
 */
const JobDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { data, error, loading, refetch } = useApiResource((config) => getJobById(id, config), [id]);
  const job = data?.data;

  const [criteria, setCriteria] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Load the server state into the editable form whenever the job is (re)fetched.
  useEffect(() => {
    if (!job) return;
    const reqs = job.requirements || {};
    setCriteria({
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
    setIsDirty(false);
  }, [job]);

  const metrics = job?.metrics || {};
  const tiers = metrics.scoreTiers || {};

  const updateCriteria = (changes) => {
    setCriteria((prev) => ({ ...prev, ...changes }));
    setIsDirty(true);
    setValidationError('');
  };

  const addTo = (key) => (value) => updateCriteria({ [key]: [...criteria[key], value] });
  const removeFrom = (key) => (index) => updateCriteria({ [key]: criteria[key].filter((_, i) => i !== index) });

  const handleSave = async () => {
    const minExp = parseFloat(criteria.minimumExperience);
    const maxExp = criteria.maximumExperience === '' ? null : parseFloat(criteria.maximumExperience);
    const salMin = criteria.salaryMin === '' ? null : parseFloat(criteria.salaryMin);
    const salMax = criteria.salaryMax === '' ? null : parseFloat(criteria.salaryMax);

    if (Number.isNaN(minExp) || minExp < 0) {
      setValidationError('Minimum experience must be zero or greater.');
      return;
    }
    if (maxExp !== null && (Number.isNaN(maxExp) || maxExp < minExp)) {
      setValidationError('Maximum experience cannot be less than the minimum.');
      return;
    }
    if (salMin !== null && (Number.isNaN(salMin) || salMin < 0)) {
      setValidationError('Minimum salary cannot be negative.');
      return;
    }
    if (salMax !== null && (Number.isNaN(salMax) || salMax < 0)) {
      setValidationError('Maximum salary cannot be negative.');
      return;
    }
    if (salMin !== null && salMax !== null && salMax < salMin) {
      setValidationError('Maximum salary cannot be less than the minimum.');
      return;
    }

    setSaving(true);
    setValidationError('');
    try {
      await updateJobCriteria(id, {
        requiredSkills: criteria.requiredSkills,
        preferredSkills: criteria.preferredSkills,
        searchKeywords: criteria.searchKeywords,
        preferredLocations: criteria.preferredLocations,
        qualifications: criteria.qualifications,
        minimumExperience: minExp,
        maximumExperience: maxExp,
        salaryMin: salMin,
        salaryMax: salMax,
        salaryCurrency: criteria.salaryCurrency
      });
      await refetch();
      setIsDirty(false);
      toast.success(
        metrics.analyzedCount > 0
          ? 'Criteria saved. Re-score candidates to apply the new requirements.'
          : 'Search criteria saved.'
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
      await refetch();
      toast.success(`Re-scored ${response.data?.analyzed ?? 0} candidate${response.data?.analyzed === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const jdPreview = useMemo(() => (job?.jdText || '').trim(), [job]);

  /* -------------------------------------------------------------- states --- */

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
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
          ← Jobs
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

  if (!job || !criteria) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        backTo="/jobs"
        backLabel="Jobs"
        eyebrow="Job workspace"
        title={job.title}
        actions={
          <>
            <Link to={`/jobs/${id}/import`} className="btn btn-md btn-secondary">
              <DownloadCloud className="w-4 h-4" aria-hidden="true" />
              Import candidates
            </Link>
            <Link to={`/candidates?jobId=${id}&sort=score_desc`} className="btn btn-md btn-primary">
              <Users className="w-4 h-4" aria-hidden="true" />
              View candidates
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <span className="font-mono truncate max-w-[18rem]" title={job.jdFileName}>
            {job.jdFileName}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          Created {formatDate(job.createdAt)}
        </span>
        {isDirty && <Badge variant="warning">Unsaved changes</Badge>}
      </div>

      {/* Metrics — each card links to the matching candidate view */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Candidates"
          value={metrics.candidatesCount || 0}
          icon={Users}
          tone="brand"
          to={`/candidates?jobId=${id}&sort=score_desc`}
          subtitle="Parsed for this role"
        />
        <StatCard
          label="Scored"
          value={metrics.analyzedCount || 0}
          icon={Sparkles}
          tone="violet"
          subtitle={
            metrics.candidatesCount > 0
              ? `${Math.round(((metrics.analyzedCount || 0) / metrics.candidatesCount) * 100)}% of applicants`
              : 'No candidates yet'
          }
        />
        <StatCard
          label="90%+ match"
          value={tiers.tier90 || 0}
          icon={Sparkles}
          tone="emerald"
          to={`/candidates?jobId=${id}&minScore=90&sort=score_desc`}
          subtitle="Excellent alignment"
        />
        <StatCard
          label="80–89% match"
          value={tiers.tier80_89 || 0}
          icon={Sparkles}
          tone="amber"
          to={`/candidates?jobId=${id}&minScore=80&maxScore=89&sort=score_desc`}
          subtitle="Strong alignment"
        />
      </div>

      {validationError && <InlineAlert tone="error" title="Check the criteria" message={validationError} onDismiss={() => setValidationError('')} />}

      {/* Criteria editor */}
      <Card padding="p-0">
        <div className="px-5 py-4 border-b border-slate-100">
          <CardHeader
            title="Screening criteria"
            description="These requirements drive the relevance score for every candidate on this role."
            actions={
              <Button variant="primary" size="md" icon={Save} loading={saving} onClick={handleSave} disabled={!isDirty}>
                {isDirty ? 'Save criteria' : 'Saved'}
              </Button>
            }
          />
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CriteriaChips
              id="required-skills"
              label="Required skills"
              description="Mandatory skills. Worth 40 of the 100 score points."
              icon={Sparkles}
              items={criteria.requiredSkills}
              onAdd={addTo('requiredSkills')}
              onRemove={removeFrom('requiredSkills')}
              suggestions={SUGGESTIONS.skill}
              placeholder="e.g. React"
              tone="brand"
            />
            <CriteriaChips
              id="preferred-skills"
              label="Preferred skills"
              description="Nice to have. Worth 10 points."
              icon={Sparkles}
              items={criteria.preferredSkills}
              onAdd={addTo('preferredSkills')}
              onRemove={removeFrom('preferredSkills')}
              suggestions={SUGGESTIONS.skill}
              placeholder="e.g. Docker"
            />
            <CriteriaChips
              id="search-keywords"
              label="Domain keywords"
              description="Free-text terms searched across resume content."
              icon={Search}
              items={criteria.searchKeywords}
              onAdd={addTo('searchKeywords')}
              onRemove={removeFrom('searchKeywords')}
              placeholder="e.g. EV charging, OCPP"
            />
            <CriteriaChips
              id="locations"
              label="Preferred locations"
              description="Used for the location compatibility flag."
              icon={MapPin}
              items={criteria.preferredLocations}
              onAdd={addTo('preferredLocations')}
              onRemove={removeFrom('preferredLocations')}
              suggestions={SUGGESTIONS.location}
              placeholder="e.g. Gurugram"
            />
            <CriteriaChips
              id="qualifications"
              label="Qualifications"
              description="Accepted degrees for this role."
              icon={GraduationCap}
              items={criteria.qualifications}
              onAdd={addTo('qualifications')}
              onRemove={removeFrom('qualifications')}
              suggestions={SUGGESTIONS.qualification}
              placeholder="e.g. B.Tech"
            />

            {/* Experience & salary bands */}
            <div className="rounded-card border border-slate-200 bg-slate-50/70 p-4 space-y-4">
              <div>
                <h3 className="text-meta font-semibold text-slate-900 inline-flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  Experience (years)
                </h3>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label htmlFor="min-exp" className="field-label">Minimum</label>
                    <input
                      id="min-exp"
                      type="number"
                      min="0"
                      step="0.5"
                      className="input h-9"
                      value={criteria.minimumExperience}
                      onChange={(e) => updateCriteria({ minimumExperience: e.target.value })}
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
                      value={criteria.maximumExperience}
                      onChange={(e) => updateCriteria({ maximumExperience: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-meta font-semibold text-slate-900 inline-flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  Annual salary band
                </h3>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <label htmlFor="sal-min" className="field-label">Minimum</label>
                    <input
                      id="sal-min"
                      type="number"
                      min="0"
                      step="50000"
                      className="input h-9"
                      placeholder="600000"
                      value={criteria.salaryMin}
                      onChange={(e) => updateCriteria({ salaryMin: e.target.value })}
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
                      value={criteria.salaryMax}
                      onChange={(e) => updateCriteria({ salaryMax: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="sal-currency" className="field-label">Currency</label>
                    <select
                      id="sal-currency"
                      className="select h-9"
                      value={criteria.salaryCurrency}
                      onChange={(e) => updateCriteria({ salaryCurrency: e.target.value })}
                    >
                      <option value="INR">INR</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {criteria.salaryMin || criteria.salaryMax
                    ? `${formatSalary(criteria.salaryMin || null, criteria.salaryCurrency, 'Unspecified')} – ${formatSalary(criteria.salaryMax || null, criteria.salaryCurrency, 'Unspecified')}`
                    : 'No salary band set — the salary compatibility flag stays inconclusive.'}
                </p>
              </div>
            </div>
          </div>

          {metrics.analyzedCount > 0 && (
            <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-meta text-amber-900">
                {metrics.analyzedCount} candidate{metrics.analyzedCount === 1 ? '' : 's'} already scored. Re-score them
                after changing criteria so rankings reflect the current requirements.
              </p>
              <Button variant="secondary" size="sm" icon={RefreshCw} loading={analyzing} onClick={handleReanalyze}>
                Re-score all
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Job description text */}
      <Card padding="p-0">
        <div className="px-5 py-4 border-b border-slate-100">
          <CardHeader
            title="Job description"
            description="Text extracted from the uploaded document, in memory."
            actions={<Badge variant="neutral">{jdPreview.length.toLocaleString('en-IN')} characters</Badge>}
          />
        </div>
        <div className="p-5">
          {jdPreview ? (
            <div className="rounded-control border border-slate-200 bg-slate-50 p-4 max-h-96 overflow-y-auto scroll-slim">
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{jdPreview}</pre>
            </div>
          ) : (
            <p className="text-meta text-slate-400 italic">No text could be extracted from this job description.</p>
          )}
        </div>
      </Card>
    </div>
  );
};

export default JobDetails;
