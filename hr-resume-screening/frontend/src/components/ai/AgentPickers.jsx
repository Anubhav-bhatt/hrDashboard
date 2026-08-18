import React, { useId } from 'react';
import { cx } from '../ui';
import { useApiResource } from '../../hooks/useApiResource';
import { getCandidates, getJobsSummary } from '../../services/api';

/**
 * Job and candidate selectors for the agent setup panels.
 *
 * These reuse the application's existing endpoints — `/api/jobs/summary` and
 * `/api/jobs/:jobId/candidates` — through the same `useApiResource` hook every
 * other screen uses, so cancellation, error normalization and the session cookie
 * all behave identically. No AI-specific data path was introduced, and nothing
 * here touches the backend tool registry: that layer is server-side only, and a
 * browser calling it would be exactly the architecture the previous phase set out
 * to prevent.
 *
 * Both selectors are ordinary `<select>` elements with real `<label>`s. A native
 * control is keyboard-accessible, works with a screen reader and behaves properly
 * on a phone without a line of custom code — a bespoke listbox would be a
 * regression in every one of those respects.
 *
 * Empty is a legitimate state and is stated rather than hidden: an installation
 * with no jobs yet shows "No jobs available", not an empty dropdown that looks
 * broken.
 */

const PICKER_JOB_LIMIT = 100;
const PICKER_CANDIDATE_LIMIT = 100;

/**
 * @param {Object} props
 * @param {string} props.value Selected job id, '' for none
 * @param {Function} props.onChange Receives the new job id
 * @param {string} [props.label]
 * @param {boolean} [props.disabled]
 */
export const JobPicker = ({ id, value, onChange, label = 'Job', disabled = false, className, describedBy }) => {
  const autoId = useId();
  const fieldId = id || `agent-job-${autoId}`;

  const { data, loading, error } = useApiResource(
    (config) => getJobsSummary({ limit: PICKER_JOB_LIMIT, page: 1 }, config),
    []
  );

  const jobs = data?.data || [];
  const isEmpty = !loading && !error && jobs.length === 0;

  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={fieldId} className="field-label">
        {label}
      </label>
      <select
        id={fieldId}
        className="select"
        value={value || ''}
        disabled={disabled || loading || isEmpty}
        onChange={(event) => onChange?.(event.target.value)}
        aria-describedby={describedBy}
      >
        <option value="">
          {loading ? 'Loading jobs…' : isEmpty ? 'No jobs available' : 'Select a job'}
        </option>
        {jobs.map((job) => (
          <option key={job.id} value={job.id}>
            {job.title}
            {job.status === 'CLOSED' ? ' (Closed)' : ''}
            {typeof job.candidatesCount === 'number' ? ` — ${job.candidatesCount} candidates` : ''}
          </option>
        ))}
      </select>

      {error && (
        <p className="text-xs text-rose-600 mt-1.5" role="alert">
          Unable to load jobs. {error.message}
        </p>
      )}
      {isEmpty && (
        <p className="text-xs text-slate-500 mt-1.5">Create a job and add candidates to use this agent.</p>
      )}
    </div>
  );
};

/**
 * Candidates belonging to one job.
 *
 * Disabled until a job is chosen, because "which candidate" is meaningless
 * without "for which role" — and the endpoint is job-scoped, so there is nothing
 * to ask for yet.
 *
 * @param {Object} props
 * @param {string} props.jobId
 * @param {string} props.value Selected candidate id
 * @param {Function} props.onChange
 */
export const CandidatePicker = ({
  id,
  jobId,
  value,
  onChange,
  label = 'Candidate',
  disabled = false,
  className,
  describedBy
}) => {
  const autoId = useId();
  const fieldId = id || `agent-candidate-${autoId}`;

  const { data, loading, error } = useApiResource(
    (config) => getCandidates(jobId, { limit: PICKER_CANDIDATE_LIMIT, page: 1, sort: 'score_desc' }, config),
    [jobId],
    { enabled: Boolean(jobId) }
  );

  const candidates = jobId ? data?.data || [] : [];
  const isEmpty = Boolean(jobId) && !loading && !error && candidates.length === 0;

  const placeholder = () => {
    if (!jobId) return 'Select a job first';
    if (loading) return 'Loading candidates…';
    if (isEmpty) return 'No candidates for this job';
    return 'Select a candidate';
  };

  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={fieldId} className="field-label">
        {label}
      </label>
      <select
        id={fieldId}
        className="select"
        value={value || ''}
        disabled={disabled || !jobId || loading || isEmpty}
        onChange={(event) => onChange?.(event.target.value)}
        aria-describedby={describedBy}
      >
        <option value="">{placeholder()}</option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name || 'Unnamed candidate'}
            {typeof candidate.overallScore === 'number' ? ` — ${candidate.overallScore}% match` : ''}
          </option>
        ))}
      </select>

      {error && (
        <p className="text-xs text-rose-600 mt-1.5" role="alert">
          Unable to load candidates. {error.message}
        </p>
      )}
    </div>
  );
};

/**
 * Multi-select for the comparison agent, bounded to a range.
 *
 * Rendered as checkboxes rather than a multi-select list box: a recruiter picking
 * three of twenty candidates should see who is already chosen without holding
 * Ctrl, and the count against the limit needs to be visible while choosing.
 *
 * The bound is enforced by disabling unchecked boxes once the maximum is reached,
 * so the limit is discoverable before it is hit rather than reported as an error
 * afterwards. The count is announced politely for screen reader users.
 */
export const CandidateMultiPicker = ({
  jobId,
  value = [],
  onChange,
  min = 2,
  max = 5,
  label = 'Candidates',
  className
}) => {
  const groupId = `agent-candidates-${useId()}`;

  const { data, loading, error } = useApiResource(
    (config) => getCandidates(jobId, { limit: PICKER_CANDIDATE_LIMIT, page: 1, sort: 'score_desc' }, config),
    [jobId],
    { enabled: Boolean(jobId) }
  );

  const candidates = jobId ? data?.data || [] : [];
  const atMax = value.length >= max;

  const toggle = (candidateId) => {
    const next = value.includes(candidateId)
      ? value.filter((id) => id !== candidateId)
      : atMax
        ? value
        : [...value, candidateId];
    onChange?.(next);
  };

  return (
    <fieldset className={cx('min-w-0', className)} aria-describedby={`${groupId}-count`}>
      <legend className="field-label">
        {label} <span className="normal-case font-normal text-slate-400">(choose {min}–{max})</span>
      </legend>

      {!jobId && <p className="text-meta text-slate-500">Select a job to choose candidates.</p>}
      {jobId && loading && <p className="text-meta text-slate-500">Loading candidates…</p>}
      {jobId && error && (
        <p className="text-xs text-rose-600" role="alert">
          Unable to load candidates. {error.message}
        </p>
      )}
      {jobId && !loading && !error && candidates.length === 0 && (
        <p className="text-meta text-slate-500">This job has no candidates yet.</p>
      )}

      {candidates.length > 0 && (
        <div className="mt-1 max-h-64 overflow-y-auto scroll-slim border border-slate-200 rounded-control divide-y divide-slate-100">
          {candidates.map((candidate) => {
            const checked = value.includes(candidate.id);
            // Only unchecked boxes lock at the maximum — a recruiter must always
            // be able to deselect their way back under the limit.
            const lockedOut = !checked && atMax;

            return (
              <label
                key={candidate.id}
                className={cx(
                  'flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors duration-fast',
                  lockedOut ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={lockedOut}
                  onChange={() => toggle(candidate.id)}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500 shrink-0"
                />
                <span className="min-w-0 flex-1 text-meta text-slate-800 truncate">
                  {candidate.name || 'Unnamed candidate'}
                </span>
                {typeof candidate.overallScore === 'number' && (
                  <span className="text-xs font-semibold text-slate-500 tabular-nums shrink-0">
                    {candidate.overallScore}%
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}

      <p id={`${groupId}-count`} className="text-xs text-slate-500 mt-1.5" aria-live="polite">
        {value.length} of {max} selected
        {value.length < min && candidates.length > 0 ? ` — choose at least ${min}` : ''}
      </p>
    </fieldset>
  );
};

export default { JobPicker, CandidatePicker, CandidateMultiPicker };
