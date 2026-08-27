import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Award, GitCompare, Info, RotateCcw, Sparkles } from 'lucide-react';
import { Button, InlineAlert, cx } from '../ui';
import { useToast } from '../ToastProvider';
import { toApiError, updateCandidateStatus } from '../../services/api';
import { buildAgentPath, SOURCE_WORKFLOWS } from '../../context/RecruitmentContext';
import ComparisonMatrix from './comparison/ComparisonMatrix';
import { CandidateHeaderStrip, StrengthsAndGaps } from './comparison/CandidateColumns';

/**
 * The comparison workspace.
 *
 * Ordered so the answer comes before the evidence:
 *
 *   1. What the comparison found, in a sentence
 *   2. Who is being compared (identity only)
 *   3. The matrix — score, fit and every mandatory requirement
 *   4. The trade-offs, in words
 *   5. The gaps that would block an offer
 *   6. Evidence and data caveats, on request
 *   7. What to do next
 *
 * The previous layout put the matrix fourth and the plain-language summary last,
 * so a recruiter met five candidate cards, a bullet list and four "dimension"
 * tiles before reaching the actual side-by-side. Everything that was on the page
 * is still here; it is the reading order that changed.
 *
 * Every value comes from the agent's structured result. Nothing is recomputed in
 * the browser, so the match score shown here is the same authoritative score the
 * rest of the product shows, and this screen cannot invent a second opinion.
 */
const ComparisonResultGrid = ({
  jobId,
  result,
  userFocus = '',
  onScreenCandidate,
  onBackToRanking,
  onReset,
  onRemoveCandidate,
  className
}) => {
  const navigate = useNavigate();
  const toast = useToast();

  // Optimistic-free shortlisting: the row shows a spinner, then the real status
  // from the server. A status that flips before the write lands would be a lie
  // the recruiter acts on.
  const [shortlistingId, setShortlistingId] = useState(null);
  const [shortlisted, setShortlisted] = useState({});
  const [shortlistError, setShortlistError] = useState(null);

  if (!result) return null;

  const {
    jobTitle,
    candidates = [],
    criteria = [],
    tradeoffs = [],
    bestByDimension = [],
    comparisonFocus,
    comparisonFocusApplied,
    comparisonFocusReason,
    summary,
    warnings = []
  } = result;

  // Merge any status this screen changed over the agent's snapshot, so a
  // shortlist made here is reflected without re-running the comparison.
  const displayCandidates = candidates.map((candidate) =>
    shortlisted[candidate.candidateId]
      ? { ...candidate, status: 'SHORTLISTED', isShortlisted: true }
      : candidate
  );

  const handleShortlist = async (candidate) => {
    if (!jobId || shortlistingId) return;
    setShortlistingId(candidate.candidateId);
    setShortlistError(null);
    try {
      await updateCandidateStatus(jobId, candidate.candidateId, 'SHORTLISTED');
      setShortlisted((prev) => ({ ...prev, [candidate.candidateId]: true }));
      toast.success(`${candidate.candidateName} shortlisted.`);
    } catch (err) {
      const apiError = toApiError(err);
      if (!apiError.canceled) {
        // The status is deliberately left untouched on failure.
        setShortlistError(`Could not shortlist ${candidate.candidateName}. ${apiError.message}`);
      }
    } finally {
      setShortlistingId(null);
    }
  };

  const handleScreen = (jId, candidateId) => {
    if (onScreenCandidate) onScreenCandidate(jId || jobId, candidateId);
    // `source` is what produces the "Back to comparison" link on the screening
    // result — without it a recruiter screening one candidate mid-comparison
    // loses the comparison they were reading.
    else
      navigate(
        buildAgentPath('screening', {
          jobId: jId || jobId,
          candidateId,
          source: SOURCE_WORKFLOWS.comparison
        })
      );
  };

  // The strongest match, taken from the agent's own dimension findings rather
  // than recomputed here. Absent when the data does not support naming one.
  const scoreLeader = bestByDimension.find((entry) => /match score/i.test(entry.dimension || ''));
  const gapBlocked = displayCandidates.filter((c) => (c.mandatoryGaps?.length || 0) > 0);

  /*
   * Is the top score actually held by one candidate?
   *
   * The agent names the first candidate at the highest score, which reads as
   * "Dhruv leads with 85%" even when all three are on 85%. The numbers are
   * right and the sentence is not, so a tie is stated as a tie. Nothing is
   * computed here beyond comparing scores that are already on screen.
   */
  const scored = displayCandidates.filter((c) => typeof c.matchScore === 'number');
  const topScore = scored.length > 0 ? Math.max(...scored.map((c) => c.matchScore)) : null;
  const leaders = scored.filter((c) => c.matchScore === topScore);
  const isTied = leaders.length > 1;

  return (
    <div className={cx('space-y-8 min-w-0', className)}>
      {/* ------------------------------------------------------ 1. the answer */}
      <section
        aria-labelledby="comparison-answer-heading"
        className="rounded-panel border border-brand-200 bg-brand-50 px-5 py-4 sm:px-6 sm:py-5"
      >
        <h2 id="comparison-answer-heading" className="text-label uppercase text-brand-700 inline-flex items-center gap-1.5">
          <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />
          Comparing {displayCandidates.length} candidates{jobTitle ? ` for ${jobTitle}` : ''}
        </h2>

        {/* Named only when one candidate actually holds the top score. With a tie
            there is no leader, and with nothing scored there is no ranking at
            all — asserting either would be fiction. */}
        {topScore === null ? (
          <p className="text-body text-slate-900 mt-1.5">
            No stored match scores are available for these candidates, so they cannot be ranked by score.
            Compare the mandatory requirements below.
          </p>
        ) : isTied ? (
          <p className="text-body text-slate-900 mt-1.5">
            {leaders.length} candidates are level on match score at {topScore}%
            {scored.length > leaders.length ? ', ahead of the rest' : ''}. The mandatory requirements below are
            what separates them.
          </p>
        ) : (
          <p className="text-body text-slate-900 mt-1.5">{scoreLeader?.reason}</p>
        )}

        {summary && <p className="text-meta text-slate-600 mt-2">{summary}</p>}

        {/* A match score is an observation. It is not a hiring decision, and the
            copy keeps those apart on purpose. */}
        {topScore !== null && (
          <p className="text-meta text-slate-500 mt-2 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            Based on stored match scores. Selecting a candidate remains your decision.
          </p>
        )}

        {/*
          Only shown when the recruiter actually asked for a focus.
          The API rejects an empty message, so a comparison with no focus still
          sends a placeholder instruction — which the agent echoes back as
          `comparisonFocus` and then reports it could not map. Rendering that
          told the recruiter their own default had failed.
        */}
        {userFocus.trim() && comparisonFocus && (
          <p className="text-meta text-slate-600 mt-3 pt-3 border-t border-brand-200/70 flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong className="text-slate-800">Focus:</strong> “{comparisonFocus}” —{' '}
              {comparisonFocusApplied
                ? 'applied to the comparison below.'
                : comparisonFocusReason || 'could not be mapped to structured criteria.'}
            </span>
          </p>
        )}
      </section>

      {shortlistError && (
        <InlineAlert tone="error" title="Shortlisting failed" message={shortlistError} onDismiss={() => setShortlistError(null)} />
      )}

      {/* --------------------------------------------------- 2. who, and 3. matrix */}
      <CandidateHeaderStrip
        candidates={displayCandidates}
        jobId={jobId}
        onScreen={handleScreen}
        onShortlist={handleShortlist}
        onRemove={onRemoveCandidate}
        shortlistingId={shortlistingId}
        canRemove={Boolean(onRemoveCandidate) && displayCandidates.length > 2}
      />

      <ComparisonMatrix criteria={criteria} candidates={displayCandidates} />

      {/* ------------------------------------------------- 4. the trade-offs */}
      {tradeoffs.length > 0 && (
        <section aria-labelledby="comparison-tradeoffs-heading">
          <h3 id="comparison-tradeoffs-heading" className="section-title">
            Key comparative trade-offs
          </h3>
          <ul className="mt-3 space-y-2">
            {tradeoffs.map((item, idx) => (
              <li key={idx} className="text-body text-slate-700 flex items-start gap-2.5">
                <span className="mt-2 w-1.5 h-1.5 rounded-pill bg-brand-400 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------- 5. gaps that would block */}
      {gapBlocked.length > 0 && (
        <section aria-labelledby="comparison-gaps-heading">
          <h3 id="comparison-gaps-heading" className="section-title inline-flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden="true" />
            Mandatory requirements not met
          </h3>
          <p className="text-meta text-slate-500 mt-0.5">
            A missing mandatory skill is not disqualifying on its own — it is what to probe first.
          </p>
          <ul className="mt-3 card p-0 divide-y divide-slate-100">
            {gapBlocked.map((candidate) => (
              <li key={candidate.candidateId} className="px-4 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-meta font-bold text-slate-900">{candidate.candidateName}</span>
                <span className="text-meta text-amber-800 min-w-0">{candidate.mandatoryGaps.join(', ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Dimension findings, compact. Not "winners" — each names one measurable
          thing and who leads on it. */}
      {bestByDimension.length > 0 && (
        <section aria-labelledby="comparison-dimensions-heading">
          <h3 id="comparison-dimensions-heading" className="section-title inline-flex items-center gap-2">
            <Award className="w-4 h-4 text-slate-500" aria-hidden="true" />
            Strongest on each measure
          </h3>
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {bestByDimension.map((item, idx) => (
              <li key={idx} className="card card-pad-sm">
                <p className="text-label uppercase text-slate-500">{item.dimension}</p>
                <p className="text-card-title text-slate-900 mt-1 truncate">{item.candidateName}</p>
                <p className="text-meta text-slate-600 mt-1">{item.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------- 6. evidence */}
      <StrengthsAndGaps candidates={displayCandidates} />

      {warnings.length > 0 && (
        <section aria-labelledby="comparison-warnings-heading">
          <h3 id="comparison-warnings-heading" className="text-label uppercase text-slate-500">
            Data notes
          </h3>
          <ul className="mt-2 space-y-1">
            {warnings.map((warning, idx) => (
              <li key={idx} className="text-meta text-slate-600 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
                <span className="min-w-0">{warning}</span>
              </li>
            ))}
          </ul>
          <p className="text-meta text-slate-500 mt-2">
            Missing information is not counted against a candidate.
          </p>
        </section>
      )}

      {/* ---------------------------------------------------- 7. what is next */}
      <section className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
        {onBackToRanking && (
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBackToRanking}>
            Back to ranking
          </Button>
        )}
        {onReset && (
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onReset}>
            Compare different candidates
          </Button>
        )}
      </section>
    </div>
  );
};

export default ComparisonResultGrid;
