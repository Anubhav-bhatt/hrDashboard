import React, { useState } from 'react';
import { GitCompare } from 'lucide-react';
import { Button, Card, InlineAlert } from '../../components/ui';
import AgentShell from '../../components/ai/AgentShell';
import AgentInput from '../../components/ai/AgentInput';
import AgentEmptyState from '../../components/ai/AgentEmptyState';
import AgentResultContainer from '../../components/ai/AgentResultContainer';
import ComparisonResultGrid from '../../components/ai/ComparisonResultGrid';
import { CandidateMultiPicker, JobPicker } from '../../components/ai/AgentPickers';
import { AGENT_MODES } from '../../constants/agentModes';

/** UI bounds. The server will enforce its own when execution is connected. */
export const MIN_COMPARISON_CANDIDATES = 2;
export const MAX_COMPARISON_CANDIDATES = 5;

/**
 * Comparison: two to five candidates, side by side, for one job.
 *
 * The bounds are real and enforced in the UI today. Below two there is nothing to
 * compare; above five the grid stops being readable and the comparison stops
 * being useful — a recruiter who wants to narrow twenty people should rank them
 * first, which is what the ranking agent is for.
 *
 * The maximum is enforced by disabling unselected candidates once five are
 * chosen, so the limit is visible while choosing rather than reported as an error
 * afterwards. The minimum is enforced on the action, with the reason stated.
 */
const ComparisonAgent = () => {
  const [jobId, setJobId] = useState('');
  const [candidateIds, setCandidateIds] = useState([]);
  const [attempted, setAttempted] = useState(false);

  const count = candidateIds.length;
  const canCompare = Boolean(jobId) && count >= MIN_COMPARISON_CANDIDATES && count <= MAX_COMPARISON_CANDIDATES;

  const onJobChange = (nextJobId) => {
    setJobId(nextJobId);
    // Candidates belong to the job that was selected when they were picked.
    setCandidateIds([]);
    setAttempted(false);
  };

  return (
    <AgentShell
      mode={AGENT_MODES.comparison}
      setup={
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <JobPicker value={jobId} onChange={onJobChange} />
            <CandidateMultiPicker
              jobId={jobId}
              value={candidateIds}
              onChange={(next) => {
                setCandidateIds(next);
                setAttempted(false);
              }}
              min={MIN_COMPARISON_CANDIDATES}
              max={MAX_COMPARISON_CANDIDATES}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={GitCompare} disabled={!canCompare} onClick={() => setAttempted(true)}>
              Compare candidates
            </Button>
            {!canCompare && (
              <p className="text-xs text-slate-500">
                {!jobId
                  ? 'Select a job to continue.'
                  : `Select at least ${MIN_COMPARISON_CANDIDATES} candidates (up to ${MAX_COMPARISON_CANDIDATES}).`}
              </p>
            )}
          </div>
        </Card>
      }
      input={
        <AgentInput
          disabled
          placeholder="Ask about the differences between these candidates…"
          disabledHint="Follow-up questions become available once the comparison agent is connected."
        />
      }
    >
      <AgentResultContainer
        empty={
          <AgentEmptyState
            icon={GitCompare}
            title="No comparison yet"
            description={`Select a job and ${MIN_COMPARISON_CANDIDATES}–${MAX_COMPARISON_CANDIDATES} of its candidates to see their skills, experience, scores and gaps side by side.`}
          />
        }
      >
        {attempted ? (
          <div className="space-y-4">
            <InlineAlert
              tone="info"
              title="Comparison is not connected yet"
              message="Your job and candidate selection is valid and working. The side-by-side analysis arrives in the next release."
            />
            <ComparisonResultGrid candidates={[]} />
          </div>
        ) : null}
      </AgentResultContainer>
    </AgentShell>
  );
};

export default ComparisonAgent;
