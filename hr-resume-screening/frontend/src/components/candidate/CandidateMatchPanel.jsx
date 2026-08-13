import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Sparkles, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Meter, cx } from '../ui';
import { getScoreMeta } from '../../utils/format';

/** Weighted score components, matching the backend scoring model. */
const SCORE_COMPONENTS = [
  { key: 'requiredSkillScore', label: 'Required skills', max: 40 },
  { key: 'experienceScore', label: 'Experience', max: 25 },
  { key: 'roleScore', label: 'Role relevance', max: 15 },
  { key: 'preferredSkillScore', label: 'Preferred skills', max: 10 },
  { key: 'projectScore', label: 'Projects', max: 5 },
  { key: 'educationScore', label: 'Education', max: 5 }
];

const FLAG_LABELS = {
  experienceMatch: 'Experience range',
  locationMatch: 'Location preference',
  qualificationMatch: 'Qualification',
  salaryMatch: 'Salary expectation'
};

/**
 * Compatibility flag. A null flag means the comparison could not be made — that
 * is displayed as "Not enough data", never as a failed check.
 */
const CompatibilityFlag = ({ label, value }) => {
  const config =
    value === true
      ? { icon: CheckCircle2, className: 'text-emerald-600', text: 'Meets criteria' }
      : value === false
        ? { icon: XCircle, className: 'text-rose-600', text: 'Outside criteria' }
        : { icon: HelpCircle, className: 'text-slate-400', text: 'Not enough data' };

  const Icon = config.icon;

  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-meta text-slate-600">{label}</span>
      <span className={cx('inline-flex items-center gap-1.5 text-xs font-semibold shrink-0', config.className)}>
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        {config.text}
      </span>
    </li>
  );
};

/**
 * Explainable relevance score: the total, the weighted breakdown that produced
 * it, requirement compatibility, and the recorded strengths and gaps.
 */
const CandidateMatchPanel = ({ candidate, onReanalyze, analyzing }) => {
  const analysis = candidate.matchAnalysis;

  if (!analysis) {
    return (
      <Card>
        <CardHeader
          title="Relevance score"
          description="This candidate has not been scored against the job description yet."
          actions={
            <Button variant="primary" size="sm" icon={Sparkles} loading={analyzing} onClick={onReanalyze}>
              Run scoring
            </Button>
          }
        />
      </Card>
    );
  }

  const meta = getScoreMeta(analysis.overallScore);
  const flags = analysis.compatibilityFlags || candidate.compatibilityFlags || {};

  return (
    <Card padding="p-0">
      <div className="px-5 py-4 border-b border-slate-100">
        <CardHeader
          title="Relevance score"
          description="Deterministic, explainable 0–100 weighting. Not an automated hiring decision."
          actions={
            <Button variant="secondary" size="sm" icon={Sparkles} loading={analyzing} onClick={onReanalyze}>
              Re-score
            </Button>
          }
        />
      </div>

      <div className="px-5 py-4">
        {/* Headline score */}
        <div className="flex items-end gap-3">
          <span className="text-[2.5rem] leading-none font-bold text-slate-900 tabular-nums">
            {analysis.overallScore}
            <span className="text-xl text-slate-400">%</span>
          </span>
          <Badge variant={meta.badge.replace('badge-', '')} className="mb-1.5">
            {analysis.alignmentLabel || meta.label}
          </Badge>
        </div>

        <Meter
          value={analysis.overallScore}
          barClass={meta.bar}
          label={`Overall relevance score: ${analysis.overallScore} out of 100`}
          className="mt-3 h-2"
        />

        {/* Weighted breakdown */}
        <div className="mt-5 space-y-3">
          <h3 className="text-label uppercase text-slate-500">Score breakdown</h3>
          {SCORE_COMPONENTS.map((component) => {
            const value = analysis[component.key] ?? 0;
            const pct = component.max > 0 ? (value / component.max) * 100 : 0;

            return (
              <div key={component.key}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600">{component.label}</span>
                  <span className="tabular-nums font-semibold text-slate-700">
                    {Math.round(value * 10) / 10}
                    <span className="text-slate-400 font-normal"> / {component.max}</span>
                  </span>
                </div>
                <Meter
                  value={pct}
                  barClass={pct >= 75 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-slate-300'}
                  label={`${component.label}: ${value} out of ${component.max}`}
                  className="mt-1"
                />
              </div>
            );
          })}
        </div>

        {/* Requirement compatibility */}
        <div className="mt-5 pt-4 divider">
          <h3 className="text-label uppercase text-slate-500 mb-1">Requirement compatibility</h3>
          <ul className="divide-y divide-slate-100">
            {Object.entries(FLAG_LABELS).map(([key, label]) => (
              <CompatibilityFlag key={key} label={label} value={flags[key]} />
            ))}
          </ul>
        </div>

        {/* Strengths & gaps */}
        {(analysis.strengths?.length > 0 || analysis.gaps?.length > 0) && (
          <div className="mt-5 pt-4 divider grid grid-cols-1 gap-4">
            {analysis.strengths?.length > 0 && (
              <div>
                <h3 className="text-label uppercase text-slate-500 mb-2 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                  Strengths
                </h3>
                <ul className="space-y-1.5">
                  {analysis.strengths.map((item, index) => (
                    <li key={index} className="text-meta text-slate-600 flex gap-2">
                      <span className="text-emerald-500 mt-1.5 shrink-0" aria-hidden="true">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.gaps?.length > 0 && (
              <div>
                <h3 className="text-label uppercase text-slate-500 mb-2 inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                  Considerations
                </h3>
                <ul className="space-y-1.5">
                  {analysis.gaps.map((item, index) => (
                    <li key={index} className="text-meta text-slate-600 flex gap-2">
                      <span className="text-amber-500 mt-1.5 shrink-0" aria-hidden="true">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {analysis.summary && (
          <div className="mt-5 pt-4 divider">
            <h3 className="text-label uppercase text-slate-500 mb-2">Summary</h3>
            <p className="text-meta text-slate-600 leading-relaxed">{analysis.summary}</p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CandidateMatchPanel;
