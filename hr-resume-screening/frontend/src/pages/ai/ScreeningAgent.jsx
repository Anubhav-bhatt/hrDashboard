import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, CheckCircle2, AlertTriangle, AlertCircle, Info, RefreshCw, ArrowLeft, Layers } from 'lucide-react';
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

const SCREENING_STEPS = [
  'Loading job requirements',
  'Loading candidate profile',
  'Reviewing existing score',
  'Preparing screening assessment'
];

const FIT_BADGES = {
  VERY_STRONG: { label: 'Very Strong Fit', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  STRONG: { label: 'Strong Fit', bg: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800' },
  MODERATE: { label: 'Moderate Fit', bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  WEAK: { label: 'Weak Fit', bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' },
  INSUFFICIENT_DATA: { label: 'Insufficient Data', bg: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800' }
};

const RECOMMENDATION_BADGES = {
  PROCEED_TO_REVIEW: { label: 'Proceed to Recruiter Review', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  REVIEW_WITH_CAUTION: { label: 'Review With Caution', bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  NEEDS_MORE_INFORMATION: { label: 'Needs More Information', bg: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800' },
  LOW_PRIORITY: { label: 'Low Priority', bg: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800' }
};

const ScreeningAgent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlJobId = searchParams.get('jobId') || '';
  const urlCandidateId = searchParams.get('candidateId') || '';

  const [jobId, setJobId] = useState(urlJobId);
  const [candidateId, setCandidateId] = useState(urlCandidateId);
  const [instruction, setInstruction] = useState('');

  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (urlJobId && urlJobId !== jobId) setJobId(urlJobId);
    if (urlCandidateId && urlCandidateId !== candidateId) setCandidateId(urlCandidateId);
  }, [urlJobId, urlCandidateId]);

  const canAnalyse = Boolean(jobId && candidateId) && !loading;

  const onJobChange = (nextJobId) => {
    setJobId(nextJobId);
    setCandidateId('');
    setResult(null);
    setError(null);
    setSearchParams(nextJobId ? { jobId: nextJobId } : {});
  };

  const onCandidateChange = (nextCandidateId) => {
    setCandidateId(nextCandidateId);
    setResult(null);
    setError(null);
    if (jobId && nextCandidateId) {
      setSearchParams({ jobId, candidateId: nextCandidateId });
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

  const handleScreenAnother = () => {
    setCandidateId('');
    setResult(null);
    setError(null);
    if (jobId) {
      setSearchParams({ jobId });
    } else {
      setSearchParams({});
    }
  };

  const fitBadge = result ? FIT_BADGES[result.fitLevel] || FIT_BADGES.MODERATE : null;
  const recBadge = result ? RECOMMENDATION_BADGES[result.recommendation] || RECOMMENDATION_BADGES.PROCEED_TO_REVIEW : null;

  return (
    <AgentShell
      mode={AGENT_MODES.screening}
      setup={
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <JobPicker id="agent-job-picker" value={jobId} onChange={onJobChange} />
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select a job and a candidate to begin screening.
              </p>
            )}
          </div>
        </Card>
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
            <Card className="border-l-4 border-l-brand-600 dark:border-l-brand-500">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {result.candidateName}
                    </h2>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
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
                <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-right">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Existing Match Score
                    </p>
                    <p className="text-2xl font-black text-brand-600 dark:text-brand-400">
                      {result.overallScore !== null ? `${result.overallScore}%` : 'Unscored'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary Statement */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {result.summary}
              </div>
            </Card>

            {/* Strengths & Gaps Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Strengths */}
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Key Strengths ({result.strengths?.length || 0})
                  </h3>
                </div>
                {result.strengths && result.strengths.length > 0 ? (
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
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
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Requirements Gaps ({result.gaps?.length || 0})
                  </h3>
                </div>
                {result.gaps && result.gaps.length > 0 ? (
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                    {result.gaps.map((gap, idx) => {
                      const isMandatory = gap.toLowerCase().includes('mandatory') || gap.toLowerCase().includes('missing mandatory');
                      return (
                        <li key={idx} className="flex items-start gap-2">
                          <span className={`font-bold ${isMandatory ? 'text-rose-500' : 'text-amber-500'}`}>!</span>
                          <span className={isMandatory ? 'font-medium text-rose-700 dark:text-rose-300' : ''}>
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
                  <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Evidence-Based Risks & Considerations ({result.risks.length})
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  {result.risks.map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-rose-800 dark:text-rose-300">
                      <span className="text-rose-500 font-bold">•</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Criteria Review Table */}
            {result.criteria && result.criteria.length > 0 && (
              <Card>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  Detailed Criteria Review
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Criterion</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Evidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {result.criteria.map((crit, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                          <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                            {crit.criterion}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 text-xs">
                            {crit.type}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                                crit.status === 'MATCH'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : crit.status === 'GAP'
                                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {crit.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-600 dark:text-slate-400">
                            {crit.evidence}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
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
