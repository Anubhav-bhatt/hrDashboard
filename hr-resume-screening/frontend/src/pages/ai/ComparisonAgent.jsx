import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  GitCompare,
  RotateCcw,
  Sparkles,
  Search,
  ArrowLeft,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Button, Card, InlineAlert, cx } from '../../components/ui';
import AgentShell from '../../components/ai/AgentShell';
import AgentEmptyState from '../../components/ai/AgentEmptyState';
import AgentProgress from '../../components/ai/AgentProgress';
import AgentResultContainer from '../../components/ai/AgentResultContainer';
import ComparisonResultGrid from '../../components/ai/ComparisonResultGrid';
import { CandidateMultiPicker, JobPicker } from '../../components/ai/AgentPickers';
import { AGENT_MODES } from '../../constants/agentModes';
import { runAgent } from '../../services/aiService';

export const MIN_COMPARISON_CANDIDATES = 2;
export const MAX_COMPARISON_CANDIDATES = 5;

const COMPARISON_STEPS = [
  { id: 'job', label: 'Retrieving role requirements' },
  { id: 'candidates', label: 'Loading candidate profiles' },
  { id: 'scores', label: 'Reviewing stored match scores' },
  { id: 'compare', label: 'Analyzing side-by-side trade-offs' }
];

const FOCUS_SUGGESTIONS = [
  'Focus on mandatory skills alignment',
  'Compare total years of experience',
  'Compare cloud & AWS knowledge',
  'Focus on immediate availability'
];

const ComparisonAgent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [jobId, setJobId] = useState(() => searchParams.get('jobId') || '');
  const [candidateIds, setCandidateIds] = useState(() => {
    const raw = searchParams.get('candidateIds');
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  });
  const [focusInstruction, setFocusInstruction] = useState('');
  const [source, setSource] = useState(() => searchParams.get('source') || '');

  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Sync state when URL params change (e.g. from Ranking handoff)
  useEffect(() => {
    const paramJobId = searchParams.get('jobId');
    const paramCandidateIds = searchParams.get('candidateIds');
    const paramSource = searchParams.get('source');

    if (paramJobId && paramJobId !== jobId) {
      setJobId(paramJobId);
    }
    if (paramCandidateIds) {
      const parsed = paramCandidateIds.split(',').map((s) => s.trim()).filter(Boolean);
      if (parsed.length > 0 && parsed.join(',') !== candidateIds.join(',')) {
        setCandidateIds(parsed);
      }
    }
    if (paramSource) {
      setSource(paramSource);
    }
  }, [searchParams]);

  const count = candidateIds.length;
  const canCompare = Boolean(jobId) && count >= MIN_COMPARISON_CANDIDATES && count <= MAX_COMPARISON_CANDIDATES;

  const onJobChange = (nextJobId) => {
    setJobId(nextJobId);
    // Candidates belong to the job that was selected when they were picked.
    setCandidateIds([]);
    setResult(null);
    setError(null);
    setSource('');
    setSearchParams(nextJobId ? { jobId: nextJobId } : {});
  };

  const handleCompare = useCallback(async () => {
    if (!canCompare || loading) return;

    setLoading(true);
    setError(null);
    setActiveStep(0);

    const stepInterval = setInterval(() => {
      setActiveStep((prev) => (prev < COMPARISON_STEPS.length - 1 ? prev + 1 : prev));
    }, 400);

    try {
      const res = await runAgent({
        mode: 'comparison',
        message: focusInstruction.trim() || 'Compare selected candidates',
        context: {
          jobId,
          candidateIds
        }
      });

      clearInterval(stepInterval);
      setActiveStep(COMPARISON_STEPS.length - 1);
      setResult(res.structuredData || res);
    } catch (err) {
      clearInterval(stepInterval);
      console.error('[ComparisonAgent] Execution error:', err);
      setError({
        title: 'Comparison failed',
        message: err.message || 'Unable to complete candidate comparison. Please verify your selection and try again.'
      });
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [jobId, candidateIds, focusInstruction, canCompare, loading]);

  const handleReset = () => {
    setCandidateIds([]);
    setResult(null);
    setError(null);
    setFocusInstruction('');
    setSource('');
    if (jobId) {
      setSearchParams({ jobId });
    } else {
      setSearchParams({});
    }
  };

  const handleBackToRanking = () => {
    navigate(`/ai/ranking${jobId ? `?jobId=${jobId}` : ''}`);
  };

  const handleScreenCandidate = (jId, cId) => {
    navigate(`/ai/screening?jobId=${jId || jobId}&candidateId=${cId}`);
  };

  return (
    <AgentShell
      mode={AGENT_MODES.comparison}
      setup={
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-bold text-sm text-slate-900">
                Candidate Comparison Setup
              </h2>
              <p className="text-xs text-slate-500">
                Choose a job and select {MIN_COMPARISON_CANDIDATES}–{MAX_COMPARISON_CANDIDATES} candidates for side-by-side criteria evaluation.
              </p>
            </div>

            {source === 'ranking' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 self-start sm:self-auto">
                <GitCompare className="w-3.5 h-3.5" /> Handoff from Ranking
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <JobPicker
              id="comparison-job-picker"
              value={jobId}
              onChange={onJobChange}
            />
            <CandidateMultiPicker
              jobId={jobId}
              value={candidateIds}
              onChange={(next) => {
                setCandidateIds(next);
                setError(null);
                setSearchParams((prev) => {
                  const updated = new URLSearchParams(prev);
                  if (next.length > 0) {
                    updated.set('candidateIds', next.join(','));
                  } else {
                    updated.delete('candidateIds');
                  }
                  return updated;
                });
              }}
              min={MIN_COMPARISON_CANDIDATES}
              max={MAX_COMPARISON_CANDIDATES}
            />
          </div>

          {/* Optional Comparison Focus */}
          <div className="space-y-1.5">
            <label htmlFor="comparison-focus-input" className="field-label">
              Optional Comparison Focus <span className="normal-case font-normal text-slate-400">(e.g., specific skill, availability)</span>
            </label>
            <input
              id="comparison-focus-input"
              type="text"
              className="input w-full"
              placeholder="e.g. Focus on mandatory skills and AWS experience"
              value={focusInstruction}
              onChange={(e) => setFocusInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCompare && !loading) {
                  handleCompare();
                }
              }}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {FOCUS_SUGGESTIONS.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setFocusInstruction(suggestion)}
                  className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Button
              id="compare-candidates-btn"
              variant="primary"
              icon={GitCompare}
              disabled={!canCompare || loading}
              onClick={handleCompare}
            >
              {loading ? 'Comparing…' : `Compare ${count >= MIN_COMPARISON_CANDIDATES ? count : ''} Candidates`}
            </Button>

            {count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                onClick={handleReset}
                disabled={loading}
              >
                Clear Selection
              </Button>
            )}

            {!canCompare && (
              <p className="text-xs text-slate-500">
                {!jobId
                  ? 'Select a job to continue.'
                  : count < MIN_COMPARISON_CANDIDATES
                  ? `Select at least ${MIN_COMPARISON_CANDIDATES} candidates to enable comparison (${count} selected).`
                  : `Maximum ${MAX_COMPARISON_CANDIDATES} candidates can be compared at once.`}
              </p>
            )}
          </div>
        </Card>
      }
    >
      <AgentResultContainer
        loading={loading}
        loadingLabel="Comparing candidates side-by-side…"
        loadingSteps={
          <AgentProgress
            steps={COMPARISON_STEPS}
            activeStepIndex={activeStep}
            title="Comparison in progress"
          />
        }
        error={error}
        errorTitle={error?.title}
        onRetry={handleCompare}
        empty={
          <AgentEmptyState
            icon={GitCompare}
            title="No comparison yet"
            description={`Select a job and ${MIN_COMPARISON_CANDIDATES}–${MAX_COMPARISON_CANDIDATES} of its candidates above to see their skills, experience, authoritative scores and trade-offs side by side.`}
          />
        }
      >
        {result ? (
          <ComparisonResultGrid
            jobId={jobId}
            result={result}
            onScreenCandidate={handleScreenCandidate}
            onBackToRanking={source === 'ranking' || Boolean(jobId) ? handleBackToRanking : null}
            onReset={handleReset}
          />
        ) : null}
      </AgentResultContainer>
    </AgentShell>
  );
};

export default ComparisonAgent;
