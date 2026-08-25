import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { GitCompare, RotateCcw, Sparkles, SlidersHorizontal, Pencil, Users } from 'lucide-react';
import { Button, Card, cx } from '../../components/ui';
import AgentShell from '../../components/ai/AgentShell';
import AgentEmptyState from '../../components/ai/AgentEmptyState';
import AgentProgress from '../../components/ai/AgentProgress';
import AgentResultContainer from '../../components/ai/AgentResultContainer';
import ComparisonResultGrid from '../../components/ai/ComparisonResultGrid';
import { CandidateMultiPicker, JobPicker } from '../../components/ai/AgentPickers';
import { AGENT_MODES } from '../../constants/agentModes';
import { runAgent } from '../../services/aiService';
import {
  buildAgentPath,
  useRecruitmentContext,
  useResolvedJobId,
  SOURCE_WORKFLOWS
} from '../../context/RecruitmentContext';

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
  const { setJob, recordComparison, lastComparisonCandidateIds } = useRecruitmentContext();

  // URL first, working context second — same rule as every other agent surface.
  const { jobId, fromContext } = useResolvedJobId(searchParams.get('jobId') || '');
  const [candidateIds, setCandidateIds] = useState(() => {
    const raw = searchParams.get('candidateIds');
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  });
  const [focusInstruction, setFocusInstruction] = useState('');
  const [source, setSource] = useState(() => searchParams.get('source') || '');

  /*
   * Whether the selection panel is open.
   *
   * The old page always showed it: arriving from Ranking with three candidates
   * already chosen still presented the full job dropdown and a scrolling list of
   * up to a hundred checkboxes above the result, asking again for something the
   * recruiter had just told it. Now the panel is for changing a selection, not for
   * confirming one, so it opens only when there is nothing usable yet — or when
   * asked for.
   */
  const [editingSelection, setEditingSelection] = useState(false);
  const [showFocus, setShowFocus] = useState(false);

  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Sync candidate selection and origin when URL params change (Ranking handoff,
  // candidate-grid handoff, or a pasted link). The job itself is resolved above.
  useEffect(() => {
    const paramCandidateIds = searchParams.get('candidateIds');
    const paramSource = searchParams.get('source');

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

  /*
   * Entered with no candidates named: restore the last comparison for this role.
   *
   * This is what makes returning from Screening — or opening Comparison from the
   * sidebar mid-task — resume the comparison the recruiter was reading rather
   * than presenting an empty picker. Guarded by a ref so it seeds once and never
   * fights a later deliberate clearing of the selection.
   */
  const seededFromContext = useRef(false);
  useEffect(() => {
    if (seededFromContext.current) return;
    if (searchParams.get('candidateIds')) {
      seededFromContext.current = true;
      return;
    }
    if (jobId && lastComparisonCandidateIds.length >= MIN_COMPARISON_CANDIDATES) {
      seededFromContext.current = true;
      setCandidateIds(lastComparisonCandidateIds.slice(0, MAX_COMPARISON_CANDIDATES));
      setSource(SOURCE_WORKFLOWS.comparison);
    }
  }, [jobId, lastComparisonCandidateIds, searchParams]);

  const count = candidateIds.length;
  const canCompare = Boolean(jobId) && count >= MIN_COMPARISON_CANDIDATES && count <= MAX_COMPARISON_CANDIDATES;

  // Open whenever there is not yet a usable selection, or on request.
  const showPicker = editingSelection || !canCompare;

  const writeCandidateParams = (next) => {
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      if (next.length > 0) updated.set('candidateIds', next.join(','));
      else updated.delete('candidateIds');
      return updated;
    });
  };

  const onJobChange = (nextJobId) => {
    // Candidates belong to the job that was selected when they were picked, so
    // setJob discards the stored selection for the previous role as well as the
    // local one — otherwise a re-entry would seed Job A's candidates into Job B.
    setJob(nextJobId);
    setCandidateIds([]);
    setResult(null);
    setError(null);
    setSource('');
    seededFromContext.current = true;
    setEditingSelection(true);
    setSearchParams(nextJobId ? { jobId: nextJobId } : {}, { replace: true });
  };

  const onCandidateSelectionChange = (next) => {
    setCandidateIds(next);
    setError(null);
    writeCandidateParams(next);
  };

  /** Drops one candidate from an existing comparison without starting over. */
  const handleRemoveCandidate = (candidateId) => {
    const next = candidateIds.filter((id) => id !== candidateId);
    setCandidateIds(next);
    writeCandidateParams(next);
    // The rendered result described the old set, so it no longer matches.
    setResult(null);
  };

  const handleCompare = useCallback(async () => {
    if (!canCompare || loading) return;

    setLoading(true);
    setError(null);
    setActiveStep(0);
    setEditingSelection(false);

    const stepInterval = setInterval(() => {
      setActiveStep((prev) => (prev < COMPARISON_STEPS.length - 1 ? prev + 1 : prev));
    }, 400);

    try {
      const res = await runAgent({
        mode: 'comparison',
        message: focusInstruction.trim() || 'Compare selected candidates',
        context: { jobId, candidateIds }
      });

      clearInterval(stepInterval);
      setActiveStep(COMPARISON_STEPS.length - 1);
      setResult(res.structuredData || res);
      // Remember what this comparison ran on, so leaving for Screening and
      // coming back returns to the same set rather than an empty picker.
      recordComparison(jobId, candidateIds);
    } catch (err) {
      clearInterval(stepInterval);
      setError({
        title: 'Comparison failed',
        // The selection is deliberately left intact so a retry costs nothing.
        message:
          err.message ||
          'Unable to complete candidate comparison. Your selected candidates are still available — try again.'
      });
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [jobId, candidateIds, focusInstruction, canCompare, loading, recordComparison]);

  const handleReset = () => {
    setCandidateIds([]);
    setResult(null);
    setError(null);
    setFocusInstruction('');
    setSource('');
    setEditingSelection(true);
    seededFromContext.current = true;
    setSearchParams(jobId ? { jobId } : {}, { replace: true });
  };

  const handleBackToRanking = () => {
    navigate(buildAgentPath('ranking', { jobId }));
  };

  const handleScreenCandidate = (jId, cId) => {
    // `source` lets Screening offer an accurate way back to this comparison.
    navigate(
      buildAgentPath('screening', {
        jobId: jId || jobId,
        candidateId: cId,
        source: SOURCE_WORKFLOWS.comparison
      })
    );
  };

  const selectionHint = !jobId
    ? 'Select a job to continue.'
    : count < MIN_COMPARISON_CANDIDATES
      ? `Select at least ${MIN_COMPARISON_CANDIDATES} candidates to compare (${count} selected).`
      : `Up to ${MAX_COMPARISON_CANDIDATES} candidates can be compared at once.`;

  return (
    <AgentShell
      mode={AGENT_MODES.comparison}
      setup={
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="section-title">
                {showPicker ? 'Choose candidates to compare' : 'Comparing'}
              </h2>
              <p className="text-meta text-slate-500 mt-0.5">
                {showPicker
                  ? `Pick a role and ${MIN_COMPARISON_CANDIDATES}–${MAX_COMPARISON_CANDIDATES} of its candidates.`
                  : /* The count is stated once, in the row below. */
                    `Up to ${MAX_COMPARISON_CANDIDATES} candidates at a time.`}
              </p>
            </div>

            {source === 'ranking' && (
              <span className="inline-flex items-center gap-1.5 text-meta font-bold px-2.5 py-1 rounded-pill bg-brand-50 text-brand-700 border border-brand-200 self-start shrink-0">
                <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />
                Handoff from Ranking
              </span>
            )}
          </div>

          {showPicker ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <JobPicker id="comparison-job-picker" value={jobId} onChange={onJobChange} />
                  {fromContext && (
                    <p className="text-meta text-slate-500 mt-1.5">
                      Using the role you were working on. Change it above if that is not right.
                    </p>
                  )}
                </div>
                <CandidateMultiPicker
                  jobId={jobId}
                  value={candidateIds}
                  onChange={onCandidateSelectionChange}
                  min={MIN_COMPARISON_CANDIDATES}
                  max={MAX_COMPARISON_CANDIDATES}
                />
              </div>

              {/*
                Comparison focus is optional and rarely used, so it no longer
                occupies the panel by default. The backend accepts a free-text
                instruction and states whether it could map it, so this is a real
                capability rather than a decorative field.
              */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowFocus((open) => !open)}
                  aria-expanded={showFocus}
                  aria-controls="comparison-focus-panel"
                  className="inline-flex items-center gap-1.5 text-meta font-bold text-brand-700
                             hover:text-brand-800 rounded focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                  {showFocus ? 'Hide comparison focus' : 'Add a comparison focus (optional)'}
                </button>

                <div id="comparison-focus-panel" hidden={!showFocus} className="mt-3 space-y-2">
                  <label htmlFor="comparison-focus-input" className="field-label">
                    What should the comparison pay most attention to?
                  </label>
                  <input
                    id="comparison-focus-input"
                    type="text"
                    className="input w-full"
                    placeholder="e.g. Focus on mandatory skills and AWS experience"
                    value={focusInstruction}
                    onChange={(e) => setFocusInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canCompare && !loading) handleCompare();
                    }}
                  />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {FOCUS_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setFocusInstruction(suggestion)}
                        className="px-2.5 py-1.5 rounded-control border border-slate-200 bg-white
                                   text-meta text-slate-700 hover:border-slate-300 hover:bg-slate-50
                                   transition-colors duration-fast focus-visible:outline-none
                                   focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Everything already known, stated in one line with a way to change it. */
            <div className="flex flex-wrap items-center gap-2 rounded-control border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Users className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
              <p className="text-meta text-slate-700 min-w-0 flex-1">
                {count} candidate{count === 1 ? '' : 's'} selected
                {focusInstruction ? ` · focus: “${focusInstruction}”` : ''}
              </p>
              <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditingSelection(true)}>
                Change selection
              </Button>
            </div>
          )}

          <div className="pt-1 flex flex-wrap items-center gap-3">
            <Button
              id="compare-candidates-btn"
              variant="primary"
              icon={GitCompare}
              disabled={!canCompare || loading}
              loading={loading}
              onClick={handleCompare}
            >
              {loading
                ? 'Comparing…'
                : result
                  ? 'Compare again'
                  : `Compare ${count >= MIN_COMPARISON_CANDIDATES ? count : ''} candidates`}
            </Button>

            {count > 0 && showPicker && (
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={handleReset} disabled={loading}>
                Clear selection
              </Button>
            )}

            {!canCompare && <p className="text-meta text-slate-500">{selectionHint}</p>}
          </div>
        </Card>
      }
    >
      <AgentResultContainer
        loading={loading}
        loadingLabel={`Comparing ${count} candidates…`}
        loadingSteps={
          <AgentProgress steps={COMPARISON_STEPS} activeStepIndex={activeStep} title="Preparing comparison" />
        }
        error={error}
        errorTitle={error?.title}
        onRetry={handleCompare}
        empty={
          <AgentEmptyState
            icon={GitCompare}
            title={
              jobId
                ? `Select at least ${MIN_COMPARISON_CANDIDATES} candidates to compare`
                : 'Choose a role to compare candidates'
            }
            description={
              jobId
                ? 'Their match scores, mandatory requirements and trade-offs will appear side by side.'
                : 'Pick the role you are hiring for, then choose the candidates you want to weigh up.'
            }
          />
        }
      >
        {result ? (
          <ComparisonResultGrid
            jobId={jobId}
            result={result}
            userFocus={focusInstruction}
            onScreenCandidate={handleScreenCandidate}
            onBackToRanking={source === 'ranking' || Boolean(jobId) ? handleBackToRanking : null}
            onReset={handleReset}
            onRemoveCandidate={handleRemoveCandidate}
          />
        ) : null}
      </AgentResultContainer>
    </AgentShell>
  );
};

export default ComparisonAgent;
