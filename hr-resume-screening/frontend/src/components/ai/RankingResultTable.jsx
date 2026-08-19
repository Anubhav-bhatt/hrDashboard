import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Sparkles, ExternalLink, Search, GitCompare } from 'lucide-react';
import { Badge, StatusBadge, Button, cx } from '../ui';

const FIT_BADGES = {
  VERY_STRONG: { label: 'Very Strong', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  STRONG: { label: 'Strong', bg: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800' },
  MODERATE: { label: 'Moderate', bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  WEAK: { label: 'Weak', bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' },
  INSUFFICIENT_DATA: { label: 'Unscored', bg: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800' }
};

const ScoreCell = ({ score }) =>
  typeof score === 'number' ? (
    <span className="font-bold text-sm tabular-nums text-brand-600 dark:text-brand-400">{score}%</span>
  ) : (
    <span className="text-slate-400 dark:text-slate-500 italic text-xs">Unscored</span>
  );

const Points = ({ items = [], tone = 'strength' }) => {
  if (!Array.isArray(items) || items.length === 0) {
    return <span className="text-slate-400 dark:text-slate-500 italic text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, 3).map((item, idx) => (
        <span
          key={idx}
          className={cx(
            'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
            tone === 'gap'
              ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
              : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
};

const RankingResultTable = ({
  rows = [],
  onScreenCandidate,
  onCompareCandidates,
  className
}) => {
  const [selectedIds, setSelectedIds] = useState([]);

  if (!Array.isArray(rows) || rows.length === 0) return null;

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleCompareSelected = () => {
    if (selectedIds.length >= 2 && selectedIds.length <= 5 && onCompareCandidates) {
      onCompareCandidates(selectedIds);
    }
  };

  const handleCompareTop = (count) => {
    const topIds = rows.slice(0, count).map((r) => r.candidateId);
    if (topIds.length >= 2 && onCompareCandidates) {
      onCompareCandidates(topIds);
    }
  };

  const selectedCount = selectedIds.length;
  const canCompareSelected = selectedCount >= 2 && selectedCount <= 5;

  return (
    <div className={cx('min-w-0 space-y-4', className)}>
      {/* Action Toolbar for Ranking -> Comparison Handoff */}
      {onCompareCandidates && rows.length >= 2 && (
        <div className="card p-3 bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={GitCompare}
              disabled={!canCompareSelected}
              onClick={handleCompareSelected}
              id="compare-selected-btn"
            >
              Compare Selected ({selectedCount})
            </Button>
            {selectedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds([])}
                className="text-xs"
              >
                Clear
              </Button>
            )}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {selectedCount < 2 ? '(Select 2–5 candidates)' : `${selectedCount} selected for comparison`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {rows.length >= 2 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCompareTop(2)}
                className="text-xs"
              >
                Compare Top 2
              </Button>
            )}
            {rows.length >= 3 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCompareTop(3)}
                className="text-xs"
              >
                Compare Top 3
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Desktop View: Table */}
      <div className="hidden md:block card p-0 overflow-x-auto scroll-slim">
        <table className="table w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {onCompareCandidates && <th scope="col" className="w-10 py-3 px-3 text-center">Select</th>}
              <th scope="col" className="w-14 py-3 px-3">Rank</th>
              <th scope="col" className="py-3 px-3">Candidate</th>
              <th scope="col" className="w-24 py-3 px-3">Match Score</th>
              <th scope="col" className="w-28 py-3 px-3">Fit Level</th>
              <th scope="col" className="py-3 px-3">Key Strengths</th>
              <th scope="col" className="py-3 px-3">Main Gaps</th>
              <th scope="col" className="w-36 py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
            {rows.map((row) => {
              const fit = FIT_BADGES[row.fitLevel] || FIT_BADGES.MODERATE;
              const hasMandatoryGaps = Array.isArray(row.mandatoryGaps) && row.mandatoryGaps.length > 0;
              const isSelected = selectedIds.includes(row.candidateId);
              const atMax = selectedCount >= 5 && !isSelected;

              return (
                <tr
                  key={row.candidateId}
                  className={cx(
                    'transition-colors',
                    isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : 'hover:bg-slate-50/60 dark:hover:bg-slate-900/30'
                  )}
                >
                  {onCompareCandidates && (
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={atMax}
                        onChange={() => toggleSelect(row.candidateId)}
                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Select ${row.candidateName || 'candidate'} for comparison`}
                      />
                    </td>
                  )}
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">
                      #{row.rank}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {row.candidateName || row.name || 'Unnamed candidate'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {row.status && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {row.status}
                          </span>
                        )}
                        {row.priorityMatch && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 text-[10px] font-semibold">
                            <Sparkles className="w-2.5 h-2.5" /> Priority Match
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <ScoreCell score={row.matchScore ?? row.overallScore} />
                  </td>
                  <td className="py-3 px-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${fit.bg}`}>
                      {fit.label}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <Points items={row.strengths} tone="strength" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="space-y-1">
                      {hasMandatoryGaps && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          <AlertCircle className="w-3 h-3" /> Mandatory: {row.mandatoryGaps.join(', ')}
                        </span>
                      )}
                      <Points items={row.gaps} tone="gap" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right">
                    {onScreenCandidate && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Search}
                        onClick={() => onScreenCandidate(row)}
                        title="Screen this candidate in detail"
                      >
                        Screen
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile View: Stacked Cards */}
      <ul className="md:hidden space-y-3">
        {rows.map((row) => {
          const fit = FIT_BADGES[row.fitLevel] || FIT_BADGES.MODERATE;
          const hasMandatoryGaps = Array.isArray(row.mandatoryGaps) && row.mandatoryGaps.length > 0;
          const isSelected = selectedIds.includes(row.candidateId);
          const atMax = selectedCount >= 5 && !isSelected;

          return (
            <li
              key={row.candidateId}
              className={cx(
                'card card-pad space-y-3 transition-colors',
                isSelected ? 'border-brand-500 bg-indigo-50/30 dark:bg-indigo-950/20' : ''
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {onCompareCandidates && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={atMax}
                      onChange={() => toggleSelect(row.candidateId)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                      aria-label={`Select ${row.candidateName || 'candidate'} for comparison`}
                    />
                  )}
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">
                    #{row.rank}
                  </span>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                      {row.candidateName || row.name || 'Unnamed candidate'}
                    </p>
                    <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold border mt-0.5 ${fit.bg}`}>
                      {fit.label}
                    </span>
                  </div>
                </div>

                <ScoreCell score={row.matchScore ?? row.overallScore} />
              </div>

              {row.priorityMatch && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 text-xs font-semibold">
                  <Sparkles className="w-3 h-3" /> Matches priority preference
                </span>
              )}

              {hasMandatoryGaps && (
                <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-rose-600" />
                  <span>Missing mandatory: {row.mandatoryGaps.join(', ')}</span>
                </div>
              )}

              <dl className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400 font-semibold mb-1">Strengths</dt>
                  <dd><Points items={row.strengths} tone="strength" /></dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400 font-semibold mb-1">Gaps</dt>
                  <dd><Points items={row.gaps} tone="gap" /></dd>
                </div>
              </dl>

              {onScreenCandidate && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-center"
                    icon={Search}
                    onClick={() => onScreenCandidate(row)}
                  >
                    Screen Candidate
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default RankingResultTable;
