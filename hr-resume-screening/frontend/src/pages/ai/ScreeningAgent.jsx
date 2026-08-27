import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Search, CheckCircle2, AlertTriangle, AlertCircle, Info, RefreshCw, ArrowLeft, Layers, Pencil } from 'lucide-react';
import { Button, Card, InlineAlert } from '../../components/ui';
import AgentShell from '../../components/ai/AgentShell';
import AgentInput from '../../components/ai/AgentInput';
import AgentEmptyState from '../../components/ai/AgentEmptyState';
import AgentErrorState from '../../components/ai/AgentErrorState';
import AgentResultContainer from '../../components/ai/AgentResultContainer';
import AgentProgress from '../../components/ai/AgentProgress';
import { CandidatePicker, JobPicker } from '../../components/ai/AgentPickers';
import { AGENT_MODES } from '../../constants/agentModes';
import { runAgent } from '../../services/aiService';
import {
  buildAgentPath,
  useRecruitmentContext,
  useResolvedJobId,
  SOURCE_WORKFLOWS
} from '../../context/RecruitmentContext';

const SCREENING_STEPS = [
  'Loading job requirements',
  'Loading candidate profile',
  'Reviewing existing score',
  'Preparing screening assessment'
];

const FIT_BADGES = {
  VERY_STRONG: { label: 'Very Strong Fit', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  STRONG: { label: 'Strong Fit', bg: 'bg-teal-50 text-teal-700 border-teal-200' },
  MODERATE: { label: 'Moderate Fit', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  WEAK: { label: 'Weak Fit', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  INSUFFICIENT_DATA: { label: 'Insufficient Data', bg: 'bg-slate-50 text-slate-700 border-slate-200' }
};

const RECOMMENDATION_BADGES = {
  PROCEED_TO_REVIEW: { label: 'Proceed to Recruiter Review', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REVIEW_WITH_CAUTION: { label: 'Review With Caution', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  NEEDS_MORE_INFORMATION: { label: 'Needs More Information', bg: 'bg-sky-50 text-sky-700 border-sky-200' },
  LOW_PRIORITY: { label: 'Low Priority', bg: 'bg-slate-50 text-slate-700 border-slate-200' }
};

const ScreeningAgent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { setJob, lastComparisonCandidateIds } = useRecruitmentContext();

  const urlJobId = searchParams.get('jobId') || '';
  const urlCandidateId = searchParams.get('candidateId') || '';
  const urlSource = searchParams.get('source') || '';

  const { jobId, fromContext } = useResolvedJobId(urlJobId);
  const [candidateId, setCandidateId] = useState(urlCandidateId);
  const [instruction, setInstruction] = useState('');

  /*
   * Where this screening was opened from, so the way back is accurate.
   *
   * Screening is a detour: a recruiter reaches it from a comparison, a ranking or
   * a profile and wants to return to what they were reading. Offering a single
   * generic "Back" that guesses would drop them somewhere they never were, so the
   * origin travels in the URL and only a recognised one produces a return link.
   */
  const returnTo =
    urlSource === SOURCE_WORKFLOWS.comparison && lastComparisonCandidateIds.length >= 2
      ? {
          label: 'Back to comparison',
          to: buildAgentPath('comparison', { jobId, candidateIds: lastComparisonCandidateIds })
        }
      : urlSource === SOURCE_WORKFLOWS.ranking
        ? { label: 'Back to ranking', to: buildAgentPath('ranking', { jobId }) }
        // The candidate list this candidate belongs to. Job-scoped rather than
        // the global pool, because that is the list that certainly contains them.
        : urlSource === SOURCE_WORKFLOWS.candidates && jobId
          ? { label: 'Back to candidates', to: `/jobs/${jobId}/candidates?sort=score_desc` }
          : urlSource === SOURCE_WORKFLOWS.profile && urlCandidateId
            ? { label: 'Back to candidate profile', to: `/candidates/${urlCandidateId}` }
            : null;

  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showCriteriaDetails, setShowCriteriaDetails] = useState(false);

  /*
   * Whether the picker panel is open.
   *
   * The panel used to be the first thing on the page, always. Arriving from a
   * candidate card — which had already told us the job and the candidate —
   * still presented both dropdowns and a Run button, so the recruiter's answer
   * to "who, for which role" was collected twice. The panel is now for changing
   * a selection, not for confirming one: it opens when there is nothing usable
   * yet, or when asked for.
   */
  const [editingSelection, setEditingSelection] = useState(false);

  // The job is resolved above; only the candidate needs mirroring from the URL.
  useEffect(() => {
    if (urlCandidateId && urlCandidateId !== candidateId) setCandidateId(urlCandidateId);
  }, [urlCandidateId]);

  const canAnalyse = Boolean(jobId && candidateId) && !loading;

  const onJobChange = (nextJobId) => {
    setJob(nextJobId);
    setCandidateId('');
    setResult(null);
    setError(null);
    setSearchParams(nextJobId ? { jobId: nextJobId } : {}, { replace: true });
  };

  const onCandidateChange = (nextCandidateId) => {
    setCandidateId(nextCandidateId);
    setResult(null);
    setError(null);
    // A complete selection closes the panel; the auto-run below then produces
    // the answer, so choosing a candidate is the last thing the recruiter does.
    if (jobId && nextCandidateId) setEditingSelection(false);
    if (jobId && nextCandidateId) {
      // `source` is carried through: screening a second candidate from the same
      // comparison should not strip the way back to it.
      setSearchParams(
        urlSource
          ? { jobId, candidateId: nextCandidateId, source: urlSource }
          : { jobId, candidateId: nextCandidateId },
        { replace: true }
      );
    }
  };

  const handleAnalyse = async () => {
    if (!canAnalyse) return;

    setLoading(true);
    setError(null);
    setCurrentStep(0);

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => (prev < SCREENING_STEPS.length - 1 ? prev + 1 : prev));
    }, 250);

    try {
      const response = await runAgent({
        mode: 'screening',
        message: instruction && instruction.trim() ? instruction.trim() : 'Screen candidate fit for role',
        context: {
          jobId,
          candidateIds: [candidateId]
        }
      });

      clearInterval(stepInterval);
      setCurrentStep(SCREENING_STEPS.length);

      const structured = response?.structuredData || response?.data?.structuredData || response;
      if (structured && (structured.candidateName || structured.jobTitle)) {
        setResult(structured);
      } else {
        setError('No structured screening output returned from agent.');
      }
    } catch (err) {
      clearInterval(stepInterval);
      setError(err.message || 'Screening analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /*
   * Complete context runs itself.
   *
   * Every entry point into screening already names the job and the candidate —
   * a candidate card, a profile, a ranking row, a comparison column, the
   * minimal-mode tools. Asking the recruiter to press Run to confirm what they
   * just clicked collects no new information. Keyed on the pair so changing the
   * candidate re-runs, and a failed run is not retried in a loop.
   */
  const autoRunKey = useRef(null);
  useEffect(() => {
    const key = jobId && candidateId ? `${jobId}:${candidateId}` : null;
    if (!key || autoRunKey.current === key) return;
    autoRunKey.current = key;
    if (!loading) handleAnalyse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, jobId]);

  const handleScreenAnother = () => {
    setCandidateId('');
    setResult(null);
    setError(null);
    if (jobId) {
      setSearchParams(urlSource ? { jobId, source: urlSource } : { jobId }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const fitBadge = result ? FIT_BADGES[result.fitLevel] || FIT_BADGES.MODERATE : null;
  const recBadge = result ? RECOMMENDATION_BADGES[result.recommendation] || RECOMMENDATION_BADGES.PROCEED_TO_REVIEW : null;

  const hasSelection = Boolean(jobId && candidateId);
  // Open when there is nothing usable yet, or on request. Deliberately not keyed
  // on `canAnalyse`, which also tracks loading and would reopen mid-run.
  const showSetup = editingSelection || !hasSelection;

  return (
    <AgentShell
      mode={AGENT_MODES.screening}
      setup={
        !showSetup ? (
          /* Collapsed: state who is being screened, for which role, and offer the
             way to change it. The names come from the agent result rather than a
             second lookup, so nothing here can disagree with the analysis below. */
          <Card padding="card-pad-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                {returnTo && (
                  <Link to={returnTo.to} className="btn btn-sm btn-ghost shrink-0">
                    <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">{returnTo.label}</span>
                  </Link>
                )}
                <div className="min-w-0">
                  <p className="text-meta font-bold text-slate-900 truncate">
                    {result?.candidateName || (loading ? 'Screening candidate…' : 'Selected candidate')}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {result?.jobTitle || 'Selected role'}
                    {fromContext && ' · using the role you were working on'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditingSelection(true)}>
                  Change selection
                </Button>
              </div>
            </div>
          </Card>
        ) : (
        <Card>
          {/* Only rendered when the origin is known, so it can never send a
              recruiter somewhere they did not come from. */}
          {returnTo && (
            <div className="mb-4 pb-3 border-b border-slate-100">
              <Link to={returnTo.to} className="btn btn-sm btn-ghost">
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                {returnTo.label}
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="min-w-0">
              <JobPicker id="agent-job-picker" value={jobId} onChange={onJobChange} />
              {fromContext && (
                <p className="text-meta text-slate-500 mt-1.5">
                  Using the role you were working on. Change it above if that is not right.
                </p>
              )}
            </div>
            <CandidatePicker id="agent-candidate-picker" jobId={jobId} value={candidateId} onChange={onCandidateChange} />
          </div>

          <div className="mt-4">
            <label htmlFor="screening-instruction" className="field-label">
              Optional recruiter instruction
            </label>
            <input
              id="screening-instruction"
              type="text"
              className="input"
              placeholder="e.g. Focus on backend depth and TypeScript experience"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              disabled={loading}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              icon={Search}
              disabled={!canAnalyse}
              onClick={handleAnalyse}
              loading={loading}
              id="analyze-candidate-btn"
            >
              {loading ? 'Analyzing candidate…' : 'Analyse candidate'}
            </Button>
            {!canAnalyse && !loading && (
              <p className="text-xs text-slate-500">
                Select a job and a candidate to begin screening.
              </p>
            )}
          </div>
        </Card>
        )
      }
      input={
        <AgentInput
          disabled
          placeholder="Ask a follow-up about this candidate…"
          disabledHint="Interactive follow-up chat will be connected in a future release."
        />
      }
    >
      <AgentResultContainer
        loading={loading}
        loadingLabel="Analyzing candidate suitability"
        loadingSteps={SCREENING_STEPS}
        error={error ? { message: error } : null}
        errorTitle="Screening Analysis Error"
        onRetry={handleAnalyse}
        empty={
          <AgentEmptyState
            icon={Search}
            title="No screening yet"
            description="Choose a job and a candidate, then run the analysis to see how their skills, experience and education line up with the role."
          />
        }
      >
        {result ? (
          <div className="space-y-6 animate-fade-in" id="screening-result-card">
            {/* Top Assessment Header */}
            <Card className="border-l-4 border-l-brand-600">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900">
                      {result.candidateName}
                    </h2>
                    <span className="text-sm text-slate-500">
                      for {result.jobTitle}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {fitBadge && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${fitBadge.bg}`}>
                        {fitBadge.label}
                      </span>
                    )}
                    {recBadge && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${recBadge.bg}`}>
                        {recBadge.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Score Panel */}
                <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-medium">
                      Existing Match Score
                    </p>
                    <p className="text-2xl font-black text-brand-600">
                      {result.overallScore !== null ? `${result.overallScore}%` : 'Unscored'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary Statement */}
              <div className="mt-4 pt-4 border-t border-slate-100 text-sm text-slate-700 leading-relaxed">
                {result.summary}
              </div>
            </Card>

            {/* Strengths & Gaps Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Strengths */}
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Key Strengths ({result.strengths?.length || 0})
                  </h3>
                </div>
                {result.strengths && result.strengths.length > 0 ? (
                  <ul className="space-y-2 text-sm text-slate-700">
                    {result.strengths.map((str, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>{str.replace(/^✓\s*/, '')}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 italic">No specific strengths recorded.</p>
                )}
              </Card>

              {/* Gaps */}
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Requirements Gaps ({result.gaps?.length || 0})
                  </h3>
                </div>
                {result.gaps && result.gaps.length > 0 ? (
                  <ul className="space-y-2 text-sm text-slate-700">
                    {result.gaps.map((gap, idx) => {
                      const isMandatory = gap.toLowerCase().includes('mandatory') || gap.toLowerCase().includes('missing mandatory');
                      return (
                        <li key={idx} className="flex items-start gap-2">
                          <span className={`font-bold ${isMandatory ? 'text-rose-500' : 'text-amber-500'}`}>!</span>
                          <span className={isMandatory ? 'font-medium text-rose-700' : ''}>
                            {gap}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 italic">No requirement gaps detected.</p>
                )}
              </Card>
            </div>

            {/* Potential Risks */}
            {result.risks && result.risks.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Evidence-Based Risks & Considerations ({result.risks.length})
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-slate-700">
                  {result.risks.map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-rose-800">
                      <span className="text-rose-500 font-bold">•</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Collapsible Criteria Review ("Why this score?") */}
            {result.criteria && result.criteria.length > 0 && (
              <Card className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowCriteriaDetails((prev) => !prev)}
                  className="w-full flex items-center justify-between text-left focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md"
                  aria-expanded={showCriteriaDetails}
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-brand-600" />
                    <h3 className="text-sm font-semibold text-slate-900">
                      Detailed Criteria Review
                    </h3>
                  </div>
                  <span className="text-xs text-brand-600 font-semibold hover:underline">
                    {showCriteriaDetails ? 'Collapse' : 'Expand'}
                  </span>
                </button>

                {showCriteriaDetails && (
                  <div className="overflow-x-auto pt-2 border-t border-slate-100">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          <th className="py-2.5 px-3">Criterion</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Evidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.criteria.map((crit, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-medium text-slate-900">
                              {crit.criterion}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 text-xs">
                              {crit.type}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                                  crit.status === 'MATCH'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : crit.status === 'GAP'
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {crit.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-600">
                              {crit.evidence}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* Data Warnings */}
            {result.dataWarnings && result.dataWarnings.length > 0 && (
              <InlineAlert
                tone="warning"
                title="Data Model & Profile Completeness"
                message={result.dataWarnings.join(' ')}
              />
            )}

            {/* Bottom Actions & Professional Disclaimer */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-slate-500 max-w-xl">
                Screening insights support recruiter review and are based on available job, candidate and scoring data. Final hiring decisions remain with recruiters.
              </p>

              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  onClick={handleScreenAnother}
                  id="screen-another-btn"
                >
                  Screen Another Candidate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ArrowLeft}
                  onClick={() => navigate('/ai')}
                >
                  AI Assistant
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </AgentResultContainer>
    </AgentShell>
  );
};

export default ScreeningAgent;
