import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  MapPin,
  Sparkles
} from 'lucide-react';
import { formatExperience, getScoreMeta, HR_STATUS_META } from '../utils/format';
import { Avatar, Button, StatusBadge, cx } from './ui';
import Drawer from './ui/Drawer';
import { CandidateActionButtons } from './candidate/CandidateActions';

const Section = ({ title, children }) => (
  <section>
    <h4 className="text-label uppercase text-slate-500">{title}</h4>
    <div className="mt-3">{children}</div>
  </section>
);

/** Fast evaluation layer that preserves the underlying result context. */
export const CandidateQuickView = ({
  candidate,
  isOpen,
  onClose,
  onOpenFullProfile,
  onStatusChange,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  statusUpdating = false,
  actions = []
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      const target = event.target;
      const isEditing =
        target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (isEditing) return;

      if (event.key === 'ArrowDown' && hasNext) {
        event.preventDefault();
        onNext();
      } else if (event.key === 'ArrowUp' && hasPrevious) {
        event.preventDefault();
        onPrevious();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hasNext, hasPrevious, isOpen, onNext, onPrevious]);

  if (!candidate) return null;

  const analysis = candidate.matchAnalysis || {};
  const score = analysis.overallScore;
  const scoreMeta = getScoreMeta(score);
  const skills = candidate.skills || [];
  const matchedSkills = analysis.matchedSkills || [];
  const missingSkills = analysis.missingRequiredSkills || [];
  const strengths = analysis.strengths || [];
  const gaps = analysis.gaps || [];
  const isSelected = candidate.hrStatus === 'SELECTED';
  const contextualActions = actions.filter((action) => action.id !== 'view');
  const hasFacts = candidate.qualification || candidate.currentLocation || candidate.jobTitle;
  const openFullProfile = () => {
    onClose();
    if (onOpenFullProfile) onOpenFullProfile(candidate);
    else navigate(`/candidates/${candidate._id}`);
  };

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      title="Candidate quick look"
      description="Focused evaluation from the current candidate results."
      className="sm:w-[30rem]"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              icon={ChevronLeft}
              onClick={onPrevious}
              disabled={!hasPrevious}
              aria-label="Previous candidate"
              title="Previous candidate (Arrow Up)"
            />
            <Button
              variant="ghost"
              size="icon"
              icon={ChevronRight}
              onClick={onNext}
              disabled={!hasNext}
              aria-label="Next candidate"
              title="Next candidate (Arrow Down)"
            />
          </div>
          <Button variant="secondary" icon={ExternalLink} onClick={openFullProfile}>
            Open full profile
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        <header className="flex items-start gap-4">
          <Avatar name={candidate.name} size="lg" className="ring-4 ring-slate-50" />
          <div className="min-w-0 flex-1">
            <h3 className="text-section break-words">{candidate.name || 'Unknown candidate'}</h3>
            <p className="mt-1 text-meta leading-5 text-slate-600">
              {candidate.headline || candidate.currentRole || 'Role not specified in resume'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={candidate.hrStatus} />
              {analysis.alignmentLabel && (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-slate-600">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                  {analysis.alignmentLabel}
                </span>
              )}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-control border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[10px] font-normal uppercase tracking-wide text-emerald-700">Match score</p>
            <p className={cx('mt-1.5 text-2xl font-bold tabular-nums', scoreMeta.text)}>
              {score === null || score === undefined ? '--' : `${Math.round(score)}%`}
            </p>
          </div>
          <div className="rounded-control border border-sky-200 bg-sky-50 p-4">
            <p className="text-[10px] font-normal uppercase tracking-wide text-sky-700">Experience</p>
            <p className="mt-1.5 text-body font-normal leading-5 text-slate-900">
              {formatExperience(candidate.totalExperience, 'Not stated')}
            </p>
          </div>
        </div>

        {hasFacts && (
          <Section title="Professional overview">
            <dl className="grid gap-4 text-meta sm:grid-cols-2">
              {candidate.currentLocation && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="font-bold text-slate-900">Location</dt>
                    <dd className="mt-0.5 break-words text-slate-600">{candidate.currentLocation}</dd>
                  </div>
                </div>
              )}
              {candidate.qualification && (
                <div className="flex items-start gap-2.5">
                  <GraduationCap className="mt-0.5 w-4 h-4 text-violet-600 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="font-bold text-slate-900">Qualification</dt>
                    <dd className="mt-0.5 break-words text-slate-600">{candidate.qualification}</dd>
                  </div>
                </div>
              )}
              {candidate.jobTitle && (
                <div className="flex items-start gap-2.5 sm:col-span-2">
                  <Briefcase className="mt-0.5 w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="font-bold text-slate-900">Applied role</dt>
                    <dd className="mt-0.5 break-words text-slate-600">{candidate.jobTitle}</dd>
                  </div>
                </div>
              )}
            </dl>
          </Section>
        )}

        {skills.length > 0 && (
          <Section title="Skills">
            <div className="flex flex-wrap gap-2">
              {skills.slice(0, 12).map((skill, index) => (
                <span key={`${skill}-${index}`} className="chip max-w-full">
                  <span className="truncate">{skill}</span>
                </span>
              ))}
              {skills.length > 12 && <span className="text-xs font-normal text-slate-500 self-center">+{skills.length - 12} more</span>}
            </div>
          </Section>
        )}

        {(matchedSkills.length > 0 || missingSkills.length > 0) && (
          <Section title="Job alignment">
            <div className="space-y-3 text-meta">
              {matchedSkills.slice(0, 6).map((skill, index) => (
                <div key={`matched-${skill}-${index}`} className="flex items-start gap-2.5 text-slate-700">
                  <CheckCircle2 className="mt-0.5 w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span>{skill}</span>
                </div>
              ))}
              {missingSkills.slice(0, 4).map((skill, index) => (
                <div key={`missing-${skill}-${index}`} className="flex items-start gap-2.5 text-slate-700">
                  <AlertTriangle className="mt-0.5 w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                  <span>{skill} <span className="text-slate-500">not evidenced</span></span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {strengths.length > 0 && (
          <Section title="Strengths">
            <ul className="space-y-3 text-meta leading-5 text-slate-700">
              {strengths.slice(0, 4).map((strength, index) => (
                <li key={`${strength}-${index}`} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span>{strength}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {gaps.length > 0 && (
          <Section title="Gaps to review">
            <ul className="space-y-3 text-meta leading-5 text-slate-700">
              {gaps.slice(0, 4).map((gap, index) => (
                <li key={`${gap}-${index}`} className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                  <span>{gap}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {analysis.summary && (
          <Section title="Evaluation summary">
            <p className="text-meta leading-6 text-slate-700">{analysis.summary}</p>
          </Section>
        )}

        {candidate.notes && (
          <Section title="Recruiter review">
            <p className="whitespace-pre-wrap text-meta leading-6 text-slate-700">{candidate.notes}</p>
          </Section>
        )}

        <Section title="Candidate status">
          {isSelected || !onStatusChange ? (
            <StatusBadge status="SELECTED" />
          ) : (
            <select
              id="quick-look-status"
              className="select"
              value={candidate.hrStatus || 'REVIEW'}
              disabled={statusUpdating}
              onChange={(event) => onStatusChange(candidate, event.target.value)}
              aria-label={`Candidate status for ${candidate.name}`}
            >
              {Object.entries(HR_STATUS_META)
                .filter(([value]) => value !== 'SELECTED')
                .map(([value, meta]) => (
                  <option key={value} value={value}>{meta.label}</option>
                ))}
            </select>
          )}
        </Section>

        {contextualActions.length > 0 && (
          <Section title="Next action">
            <CandidateActionButtons actions={contextualActions} layout="quickLook" />
          </Section>
        )}
      </div>
    </Drawer>
  );
};

export default CandidateQuickView;
