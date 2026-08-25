import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  CheckCircle2,
  ExternalLink,
  GitCompare,
  Search,
  Sparkles,
  User,
  XCircle,
  ArrowLeft
} from 'lucide-react';
import { Badge, StatusBadge, Button, cx } from '../ui';

const FIT_BADGES = {
  VERY_STRONG: { label: 'Very Strong', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  STRONG: { label: 'Strong', bg: 'bg-teal-50 text-teal-700 border-teal-200' },
  MODERATE: { label: 'Moderate', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  WEAK: { label: 'Weak', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  INSUFFICIENT_DATA: { label: 'Unscored', bg: 'bg-slate-50 text-slate-700 border-slate-200' }
};

const StatusIcon = ({ status }) => {
  if (status === 'MATCH') {
    return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
  }
  if (status === 'GAP') {
    return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
  }
  if (status === 'PARTIAL') {
    return <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />;
  }
  return <span className="text-slate-400 text-xs">—</span>;
};

const ComparisonResultGrid = ({
  jobId,
  result,
  onScreenCandidate,
  onBackToRanking,
  onReset,
  className
}) => {
  const navigate = useNavigate();

  if (!result) return null;

  const {
    jobTitle,
    candidateCount = 0,
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

  return (
    <div className={cx('space-y-6 min-w-0', className)}>
      {/* Top Header / Context Bar */}
      <div className="card bg-gradient-to-r from-slate-50 to-brand-50/40 border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Side-by-Side Candidate Comparison
            </span>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              {jobTitle || 'Role Comparison'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Comparing {candidates.length} candidate{candidates.length === 1 ? '' : 's'} using authoritative match scores and structured hiring criteria.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onBackToRanking && (
              <Button
                variant="secondary"
                size="sm"
                icon={ArrowLeft}
                onClick={onBackToRanking}
              >
                Back to Ranking
              </Button>
            )}
            {onReset && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
              >
                Compare Others
              </Button>
            )}
          </div>
        </div>

        {/* Comparison Focus Banner if present */}
        {comparisonFocus && (
          <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-start gap-2 text-xs">
            <Sparkles className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-violet-900">
                Focus: "{comparisonFocus}"
              </span>
              <span className="text-slate-600 ml-1.5">
                {comparisonFocusApplied
                  ? `(Applied to comparative analysis)`
                  : `(${comparisonFocusReason || 'Focus could not be mapped to structured attributes'})`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Compared Candidates Summary Cards (2-5 Columns) */}
      <div className={cx(
        'grid gap-4',
        candidates.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
        candidates.length === 3 ? 'grid-cols-1 md:grid-cols-3' :
        candidates.length === 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' :
        'grid-cols-1 md:grid-cols-3 lg:grid-cols-5'
      )}>
        {candidates.map((cand, idx) => {
          const fit = FIT_BADGES[cand.fitLevel] || FIT_BADGES.MODERATE;
          const hasMandatoryGaps = Array.isArray(cand.mandatoryGaps) && cand.mandatoryGaps.length > 0;

          return (
            <div
              key={cand.candidateId}
              className="card flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
            >
              {cand.priorityMatch && (
                <div className="absolute top-0 right-0 bg-violet-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl">
                  Focus Match
                </div>
              )}

              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-400 uppercase">
                      Candidate #{idx + 1}
                    </p>
                    <h3 className="font-bold text-slate-900 text-base truncate">
                      {cand.candidateName || 'Unnamed candidate'}
                    </h3>
                  </div>
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-xs text-slate-500 font-medium">Match Score:</span>
                  {typeof cand.matchScore === 'number' ? (
                    <span className="text-xl font-extrabold text-brand-600 tabular-nums">
                      {cand.matchScore}%
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-slate-400 italic">
                      Unscored
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${fit.bg}`}>
                    {fit.label}
                  </span>
                  {cand.status && (
                    <span className="text-xs text-slate-500 px-1.5 py-0.5 bg-slate-100 rounded">
                      {cand.status}
                    </span>
                  )}
                </div>

                {hasMandatoryGaps && (
                  <div className="mt-3 p-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    <p className="font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Missing Mandatory:
                    </p>
                    <p className="mt-0.5">{cand.mandatoryGaps.join(', ')}</p>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 text-xs"
                  icon={Search}
                  onClick={() => {
                    if (onScreenCandidate) {
                      onScreenCandidate(jobId, cand.candidateId);
                    } else {
                      navigate(`/ai/screening?jobId=${jobId}&candidateId=${cand.candidateId}`);
                    }
                  }}
                >
                  Screen
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  icon={ExternalLink}
                  onClick={() => navigate(`/candidates/${cand.candidateId}`)}
                  title="View Profile"
                >
                  Profile
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Key Trade-offs Section */}
      {tradeoffs.length > 0 && (
        <div className="card bg-slate-50/70 border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <GitCompare className="w-4 h-4 text-brand-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              Key Comparative Trade-offs
            </h3>
          </div>
          <ul className="space-y-2 text-sm text-slate-700">
            {tradeoffs.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-brand-500 font-bold mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Best By Dimension Section */}
      {bestByDimension.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            Comparative Dimension Highlights
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {bestByDimension.map((item, idx) => (
              <div key={idx} className="card p-3 bg-white border-slate-200">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {item.dimension}
                </p>
                <p className="font-bold text-sm text-slate-900 mt-1 truncate">
                  {item.candidateName}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  {item.reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Criteria Breakdown Matrix */}
      {criteria.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900">
            Detailed Criteria Breakdown
          </h3>
          <div className="card p-0 overflow-x-auto scroll-slim">
            <table className="table w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th scope="col" className="sticky left-0 z-20 bg-slate-50/95 backdrop-blur py-3 px-4 w-48 min-w-[12rem]">
                    Hiring Criterion
                  </th>
                  {candidates.map((cand) => (
                    <th key={cand.candidateId} scope="col" className="py-3 px-4 min-w-[12rem]">
                      <div className="font-bold text-slate-900 truncate">
                        {cand.candidateName}
                      </div>
                      <div className="text-[11px] font-normal text-slate-500">
                        {typeof cand.matchScore === 'number' ? `${cand.matchScore}% Match` : 'Unscored'}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {criteria.map((crit, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-white font-semibold text-slate-800 py-3 px-4 text-left align-top"
                    >
                      <div className="flex flex-col">
                        <span>{crit.label || crit.criterion}</span>
                        {crit.type && (
                          <span className="text-[10px] font-normal uppercase tracking-wider text-slate-400">
                            {crit.type.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </th>
                    {candidates.map((cand) => {
                      const val = (crit.values || []).find((v) => v.candidateId === cand.candidateId);
                      const status = val?.status || 'UNKNOWN';

                      return (
                        <td key={cand.candidateId} className="py-3 px-4 align-top text-xs">
                          <div className="flex items-center gap-1.5">
                            <StatusIcon status={status} />
                            <span className="font-medium text-slate-800">
                              {val?.evidence || '—'}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warnings / Data Notes */}
      {warnings.length > 0 && (
        <div className="p-3 rounded-card bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <p className="font-bold flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Comparison Notices & Data Gaps:
          </p>
          <ul className="mt-1 list-disc list-inside space-y-0.5">
            {warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary Box */}
      {summary && (
        <div className="card p-4 bg-slate-50/50 text-xs text-slate-600">
          <p className="font-semibold text-slate-800 mb-1">
            Recruiter Guidance Summary
          </p>
          <p>{summary}</p>
        </div>
      )}
    </div>
  );
};

export default ComparisonResultGrid;
