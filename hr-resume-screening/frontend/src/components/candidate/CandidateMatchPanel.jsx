import React, { useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  HelpCircle,
  Layers,
  Sparkles,
  XCircle
} from 'lucide-react';
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
 * it, requirement compatibility, matched/missing skills with evidence, and recorded strengths.
 */
const CandidateMatchPanel = ({ candidate, onReanalyze, analyzing }) => {
  const analysis = candidate.matchAnalysis;
  const [breakdownOpen, setBreakdownOpen] = useState(false);

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

  // Extract experience comparison details
  const expDetails = analysis.experienceDetails;
  const reqExp = expDetails?.requiredYears ?? candidate.job?.minimumExperience ?? 0;
  const relExp = expDetails?.relevantYears ?? candidate.totalExperience ?? 0;

  // Extract role relevance label
  const roleScore = analysis.roleScore ?? 0;
  const roleRelevanceLabel = roleScore >= 12 ? 'Strong' : roleScore >= 8 ? 'Good' : roleScore >= 4 ? 'Partial' : 'Low';

  // Matched and missing skills
  const matchedReqList = analysis.requiredSkillMatches?.length
    ? analysis.requiredSkillMatches.filter((m) => m.status === 'MATCHED')
    : (analysis.matchedSkills || []).map((s) => ({ matchedSkill: s, matchType: 'MATCHED' }));

  const missingReqList = analysis.missingRequiredSkills || [];

  // Key evidence bullets
  const keyEvidenceList = (analysis.keyEvidence && analysis.keyEvidence.length > 0)
    ? analysis.keyEvidence
    : (analysis.strengths && analysis.strengths.length > 0)
      ? analysis.strengths
      : [];

  // Additional candidate skills
  const additionalSkillsList = analysis.additionalSkills || [];

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

      <div className="px-5 py-4 space-y-5">
        {/* Headline score */}
        <div>
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
        </div>

        {/* Experience & Role Relevance Overview */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
          <div>
            <div className="text-xs text-slate-500 flex items-center gap-1 font-medium">
              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
              Experience
            </div>
            <div className="text-sm font-semibold text-slate-800 mt-0.5">
              {relExp} yrs relevant <span className="text-xs font-normal text-slate-500">/ {reqExp} req</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 flex items-center gap-1 font-medium">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              Role relevance
            </div>
            <div className="text-sm font-semibold text-slate-800 mt-0.5">
              {roleRelevanceLabel}
            </div>
          </div>
        </div>

        {/* Matched & Missing Skills */}
        <div className="pt-3 border-t border-slate-100">
          <h3 className="text-label uppercase text-slate-500 mb-2">Requirement Coverage</h3>
          
          {/* Matched */}
          {matchedReqList.length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-semibold text-emerald-700 block mb-1.5">Matched</span>
              <div className="flex flex-wrap gap-1.5">
                {matchedReqList.map((item, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-800 border border-emerald-200"
                  >
                    <Check className="w-3 h-3 text-emerald-600" />
                    {item.matchedSkill || item.requirement}
                    {item.matchType && item.matchType !== 'EXACT' && item.matchType !== 'MATCHED' && (
                      <span className="text-[10px] uppercase font-mono px-1 py-0.2 bg-emerald-100 rounded text-emerald-700">
                        {item.matchType}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing */}
          {missingReqList.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-rose-700 block mb-1.5">Missing</span>
              <div className="flex flex-wrap gap-1.5">
                {missingReqList.map((skill, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-rose-50 text-rose-800 border border-rose-200"
                  >
                    <XCircle className="w-3 h-3 text-rose-500" />
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Key Evidence */}
        {keyEvidenceList.length > 0 && (
          <div className="pt-3 border-t border-slate-100">
            <h3 className="text-label uppercase text-slate-500 mb-2">Key Evidence</h3>
            <ul className="space-y-1.5">
              {keyEvidenceList.map((bullet, idx) => (
                <li key={idx} className="text-meta text-slate-700 flex gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 mt-1 shrink-0" aria-hidden="true" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Additional Skills */}
        {additionalSkillsList.length > 0 && (
          <div className="pt-3 border-t border-slate-100">
            <h3 className="text-label uppercase text-slate-500 mb-2">Additional Candidate Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {additionalSkillsList.slice(0, 10).map((skill, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 border border-slate-200"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Potential Gaps (if distinct from missing skills) */}
        {analysis.gaps?.length > 0 && (
          <div className="pt-3 border-t border-slate-100">
            <h3 className="text-label uppercase text-slate-500 mb-2">Potential Gaps</h3>
            <ul className="space-y-1.5">
              {analysis.gaps.map((item, index) => (
                <li key={index} className="text-meta text-slate-700 flex gap-2">
                  <span className="text-slate-400 mt-0.5 shrink-0" aria-hidden="true">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-400 mt-2">
              Based on what the resume states. A gap is something the document did not evidence, not a judgement.
            </p>
          </div>
        )}

        {/* Why this score? Expandable Dimension Breakdown */}
        <div className="pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setBreakdownOpen((open) => !open)}
            aria-expanded={breakdownOpen}
            aria-controls="score-breakdown"
            className="inline-flex items-center gap-1.5 text-meta font-semibold text-brand-700 hover:text-brand-800
                       rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {breakdownOpen ? 'Hide score breakdown' : `Why ${Math.round(analysis.overallScore)}%?`}
            <ChevronDown
              className={cx('w-3.5 h-3.5 transition-transform duration-fast', breakdownOpen && 'rotate-180')}
              aria-hidden="true"
            />
          </button>

          <div id="score-breakdown" hidden={!breakdownOpen} className="mt-3 space-y-3">
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
        </div>

        {/* Requirement compatibility */}
        <div className="pt-3 border-t border-slate-100">
          <h3 className="text-label uppercase text-slate-500 mb-1">Requirement compatibility</h3>
          <ul className="divide-y divide-slate-100">
            {Object.entries(FLAG_LABELS).map(([key, label]) => (
              <CompatibilityFlag key={key} label={label} value={flags[key]} />
            ))}
          </ul>
        </div>

        {analysis.summary && (
          <div className="pt-3 border-t border-slate-100">
            <h3 className="text-label uppercase text-slate-500 mb-2">Summary</h3>
            <p className="text-meta text-slate-600 leading-relaxed">{analysis.summary}</p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CandidateMatchPanel;
