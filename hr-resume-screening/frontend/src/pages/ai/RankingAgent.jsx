import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListOrdered, Filter, Sparkles, AlertCircle, ArrowLeft, RefreshCw, Users, Scale, GitCompare } from 'lucide-react';
import { Button, Card, InlineAlert } from '../../components/ui';
import AgentShell from '../../components/ai/AgentShell';
import AgentInput from '../../components/ai/AgentInput';
import AgentEmptyState from '../../components/ai/AgentEmptyState';
import AgentErrorState from '../../components/ai/AgentErrorState';
import AgentResultContainer from '../../components/ai/AgentResultContainer';
import AgentProgress from '../../components/ai/AgentProgress';
import RankingResultTable from '../../components/ai/RankingResultTable';
import { JobPicker } from '../../components/ai/AgentPickers';
import { AGENT_MODES } from '../../constants/agentModes';
import { runAgent } from '../../services/aiService';

const RANKING_STEPS = [
  'Loading job requirements',
  'Loading eligible candidate pool',
  'Reviewing authoritative match scores',
  'Computing ranking and deterministic tie-breakers'
];

const SCOPES = [
  { id: 'ALL', label: 'All candidates', hint: 'Every candidate who applied to this job.' },
  { id: 'SHORTLISTED', label: 'Shortlisted candidates', hint: 'Only those already shortlisted.' }
];

const SUGGESTED_PREFERENCES = [
  'Prioritize AWS experience',
  'Prioritize strong TypeScript depth',
  'Prioritize Node.js backend skills',
  'Prioritize higher total experience'
];

const RankingAgent = () => {
  const navigate = useNavigate();

  const [jobId, setJobId] = useState('');
  const [scope, setScope] = useState('ALL');
  const [minScore, setMinScore] = useState('');
  const [instruction, setInstruction] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const onJobChange = (nextJobId) => {
    setJobId(nextJobId);
    setResult(null);
    setError(null);
  };

  const handleRank = async () => {
    if (!jobId || loading) return;

    setLoading(true);
    setError(null);
    setCurrentStep(0);

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => (prev < RANKING_STEPS.length - 1 ? prev + 1 : prev));
    }, 250);

    try {
      const filters = {
        candidateScope: scope
      };
      if (minScore && !Number.isNaN(Number(minScore))) {
        filters.minimumScore = Number(minScore);
      }

      const response = await runAgent({
        mode: 'ranking',
        message: instruction && instruction.trim() ? instruction.trim() : 'Rank candidate pool',
        context: {
          jobId,
          filters
        }
      });

      clearInterval(stepInterval);
      setCurrentStep(RANKING_STEPS.length);

      const structured = response?.structuredData || response?.data?.structuredData || response;
      if (structured && (structured.rankedCandidates || structured.jobTitle)) {
        setResult(structured);
      } else {
        setError('No structured ranking data returned.');
      }
    } catch (err) {
      clearInterval(stepInterval);
      setError(err.message || 'Ranking failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleScreenCandidate = (candidate) => {
    const candidateId = candidate.candidateId || candidate.id;
    if (jobId && candidateId) {
      navigate(`/ai/screening?jobId=${jobId}&candidateId=${candidateId}`);
    }
  };

  const handleCompareCandidates = (candidateIds) => {
    if (!candidateIds || candidateIds.length < 2) return;
    navigate(`/ai/comparison?jobId=${jobId}&candidateIds=${candidateIds.join(',')}&source=ranking`);
  };

  return (
    <AgentShell
      mode={AGENT_MODES.ranking}
      setup={
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <JobPicker id="agent-job-picker" value={jobId} onChange={onJobChange} />

            <fieldset className="min-w-0">
              <legend className="field-label">Candidate scope</legend>
              <div className="space-y-1.5 mt-1">
                {SCOPES.map((option) => (
                  <label key={option.id} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="ranking-scope"
                      value={option.id}
                      checked={scope === option.id}
                      onChange={() => {
                        setScope(option.id);
                        setResult(null);
                      }}
                      className="mt-0.5 w-4 h-4 border-slate-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-meta font-medium text-slate-800">
                        {option.label}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {option.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {/* Optional Filters Toggle */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
            >
              <Filter className="w-3.5 h-3.5" />
              {showFilters ? 'Hide advanced filters' : 'Show advanced filters (minimum score)'}
            </button>

            {showFilters && (
              <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                <div>
                  <label htmlFor="min-score-input" className="field-label text-xs">
                    Minimum Match Score (%)
                  </label>
                  <input
                    id="min-score-input"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="e.g. 70"
                    className="input text-xs py-1.5"
                    value={minScore}
                    onChange={(e) => setMinScore(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Ranking Preference Instruction */}
          <div className="mt-4">
            <label htmlFor="ranking-instruction" className="field-label">
              Optional ranking preference
            </label>
            <input
              id="ranking-instruction"
              type="text"
              className="input"
              placeholder="e.g. Prioritize candidates with strong AWS experience"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              disabled={loading}
            />

            {/* Quick Suggestion Chips */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium">Suggestions:</span>
              {SUGGESTED_PREFERENCES.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInstruction(chip)}
                  className="px-2 py-0.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Submit Action */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              icon={ListOrdered}
              disabled={!jobId || loading}
              onClick={handleRank}
              loading={loading}
              id="rank-candidates-btn"
            >
              {loading ? 'Ranking candidates…' : 'Rank candidates'}
            </Button>
            {!jobId && !loading && (
              <p className="text-xs text-slate-500">Select a job to begin ranking.</p>
            )}
          </div>
        </Card>
      }
      input={
        <AgentInput
          disabled
          placeholder="Refine ranking with specific criteria…"
          disabledHint="Interactive refinement will be available in a future release."
        />
      }
    >
      <AgentResultContainer
        loading={loading}
        loadingLabel="Ranking candidate pool"
        loadingSteps={RANKING_STEPS}
        error={error ? { message: error } : null}
        errorTitle="Ranking Error"
        onRetry={handleRank}
        empty={
          <AgentEmptyState
            icon={ListOrdered}
            title="No ranking yet"
            description="Select a job and rank its candidates to see them ordered by fit, with the strengths and gaps behind each position."
          />
        }
      >
        {result ? (
          <div className="space-y-6 animate-fade-in" id="ranking-results-container">
            {/* Summary & Methodology Header */}
            <Card className="border-l-4 border-l-brand-600">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {result.jobTitle}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>
                      <strong>{result.totalCandidatesConsidered}</strong> candidates considered ({result.candidateScope.toLowerCase()})
                    </span>
                    <span>•</span>
                    <span>
                      Showing <strong>{result.returnedCount}</strong> ranked results
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {result.rankedCandidates && result.rankedCandidates.length >= 2 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Scale}
                      onClick={() => handleCompareCandidates(result.rankedCandidates.slice(0, Math.min(3, result.rankedCandidates.length)).map((r) => r.candidateId))}
                      title="Compare top candidates side-by-side"
                      id="compare-top-candidates-btn"
                    >
                      Compare Top {Math.min(3, result.rankedCandidates.length)}
                    </Button>
                  )}
                </div>
              </div>

              {/* Preference Applied Banner */}
              {result.instructionApplied && (
                <div className="mt-3 p-2.5 rounded bg-violet-50 border border-violet-200 text-xs text-violet-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-600 flex-shrink-0" />
                  <span>
                    <strong>Preference Applied:</strong> {result.instructionDetails || result.instruction} (Applied as tie-breaker without altering stored scores)
                  </span>
                </div>
              )}
            </Card>

            {/* Results Table / Cards */}
            {result.rankedCandidates && result.rankedCandidates.length > 0 ? (
              <RankingResultTable
                rows={result.rankedCandidates}
                onScreenCandidate={handleScreenCandidate}
                onCompareCandidates={handleCompareCandidates}
              />
            ) : (
              <InlineAlert
                tone="info"
                title="No candidates match criteria"
                message="No candidates were found matching the selected scope and filters. Try adjusting minimum score or selecting 'All candidates'."
              />
            )}

            {/* Warnings */}
            {result.warnings && result.warnings.length > 0 && (
              <InlineAlert
                tone="warning"
                title="Ranking Scope Note"
                message={result.warnings.join(' ')}
              />
            )}

            {/* Transparency Disclaimer */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-slate-500 max-w-xl">
                Ranking prioritizes the application's authoritative match score and uses job requirement checks only for deterministic tie-breaking and explanation.
              </p>

              <div className="flex items-center gap-3">
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

export default RankingAgent;
