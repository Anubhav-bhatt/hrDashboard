import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Github,
  HelpCircle,
  Linkedin,
  Mail,
  Phone,
  X as XIcon
} from 'lucide-react';
import {
  formatExperience,
  formatPhone,
  formatRelativeTime,
  getScoreMeta,
  getStatusMeta,
  safeExternalUrl,
  toTelHref
} from '../utils/format';
import { Avatar, Badge, StatusBadge, cx } from './ui';

/**
 * Candidate list card.
 *
 * The whole card is a link to the profile, and the quick actions sit *outside*
 * that link in a sibling column. Nesting a button inside an anchor is invalid
 * HTML and produces unpredictable activation, so the layout keeps them apart:
 * the link fills the row, the actions column sits beside it.
 */
const CandidateCard = ({ candidate, actions, showJob = false, className }) => {
  const score = candidate.matchAnalysis?.overallScore;
  const scoreMeta = getScoreMeta(score);

  const skills = candidate.matchAnalysis?.matchedSkills?.length
    ? candidate.matchAnalysis.matchedSkills
    : candidate.skills || [];

  const linkedin = safeExternalUrl(candidate.linkedinUrl);
  const github = safeExternalUrl(candidate.githubUrl);
  const telHref = toTelHref(candidate.phone);

  // Only criteria the job actually defines are shown; a flag the backend could
  // not evaluate at all is omitted rather than rendered as an empty check.
  const flags = candidate.compatibilityFlags || {};
  const compatibility = [
    { key: 'experienceMatch', label: 'Experience', value: flags.experienceMatch },
    { key: 'locationMatch', label: 'Location', value: flags.locationMatch },
    { key: 'qualificationMatch', label: 'Qualification', value: flags.qualificationMatch },
    { key: 'salaryMatch', label: 'Salary', value: flags.salaryMatch }
  ].filter((f) => f.value !== undefined);

  return (
    <div className={cx('card hover:shadow-card-hover hover:border-slate-300 transition duration-fast', className)}>
      <div className="flex flex-col sm:flex-row">
        {/* Primary target: the entire information area opens the profile. */}
        <Link
          to={`/candidates/${candidate._id}`}
          className="flex-1 min-w-0 flex items-start gap-3.5 p-4 rounded-card focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset group"
          aria-label={`Open profile for ${candidate.name}`}
        >
          <Avatar name={candidate.name} size="md" />

          <div className="min-w-0 flex-1">
            {/* Identity */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-card-title text-slate-900 truncate group-hover:text-brand-700 transition-colors duration-fast">
                  {candidate.name}
                </h3>
                <p className="text-meta text-slate-600 truncate mt-0.5">
                  {candidate.headline || candidate.currentRole || 'Role not specified in resume'}
                </p>
              </div>

              {/*
                Score as a figure with its band beneath, not a badge.
                "94% / Strong match" is read at a glance down a list of fifty
                rows; a pill containing the same text is not. The slim meter
                repeats the value positionally for faster comparison, and the
                band label means the score is never conveyed by colour alone.
              */}
              <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0 w-24">
                {score !== undefined && score !== null ? (
                  <>
                    <p className="text-section text-slate-900 tabular-nums leading-none">{score}%</p>
                    <p className={cx('text-[11px] font-medium leading-none', scoreMeta.text)}>{scoreMeta.label} match</p>
                    <div className="mt-0.5 h-1 w-full rounded-pill bg-slate-100 overflow-hidden">
                      <div
                        className={cx('h-full rounded-pill', scoreMeta.bar)}
                        style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-meta text-slate-400">Not scored</p>
                )}
              </div>
            </div>

            {/* One compact line of the facts that decide a shortlist. */}
            <p className="text-xs text-slate-500 mt-2 truncate">
              {[
                formatExperience(candidate.totalExperience, 'Experience not stated'),
                candidate.currentLocation || 'Location not provided',
                candidate.qualification
              ]
                .filter(Boolean)
                .join(' · ')}
              {showJob && candidate.jobTitle ? ` · ${candidate.jobTitle}` : ''}
            </p>

            {/* Skills */}
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {skills.slice(0, 5).map((skill) => (
                  <span key={skill} className="chip py-0.5 text-[11px]">
                    {skill}
                  </span>
                ))}
                {skills.length > 5 && (
                  <span className="chip py-0.5 text-[11px] text-slate-500">+{skills.length - 5} more</span>
                )}
              </div>
            )}

            {/* Requirement compatibility at a glance. A criterion that cannot be
                assessed is shown as unknown, never as a failure. */}
            {compatibility.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5">
                {compatibility.map(({ key, label, value }) => {
                  const Icon = value === true ? Check : value === false ? XIcon : HelpCircle;
                  const tone =
                    value === true ? 'text-emerald-600' : value === false ? 'text-rose-500' : 'text-slate-300';
                  const title =
                    value === true
                      ? `${label}: meets the requirement`
                      : value === false
                        ? `${label}: outside the requirement`
                        : `${label}: not enough data`;

                  return (
                    <span key={key} className="inline-flex items-center gap-1 text-[11px] text-slate-500" title={title}>
                      <Icon className={cx('w-3 h-3 shrink-0', tone)} aria-hidden="true" />
                      {label}
                      <span className="sr-only">
                        {value === true ? ' meets requirement' : value === false ? ' outside requirement' : ' unknown'}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Status and applied time. The status badge shows at every width —
                where a candidate sits in the process is not a detail to drop on
                a small screen. */}
            <div className="flex items-center justify-between gap-2 mt-3">
              <div className="flex items-center gap-2 min-w-0">
                <StatusBadge status={candidate.hrStatus} />
                <span className="text-xs text-slate-400 truncate hidden sm:inline">
                  Applied {formatRelativeTime(candidate.createdAt, 'date unknown')}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Score repeats on mobile, where the right-hand column is hidden. */}
                {score !== undefined && score !== null && (
                  <span className="sm:hidden text-meta font-semibold text-slate-900 tabular-nums">{score}%</span>
                )}
                <ChevronRight
                  className="hidden sm:block w-4 h-4 text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all duration-fast"
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        </Link>

        {/* Sibling action column — never inside the card link. */}
        <div className="flex sm:flex-col items-center justify-end gap-1 border-t sm:border-t-0 sm:border-l border-slate-100 px-3 py-2 sm:py-3 sm:justify-center">
          {candidate.email ? (
            <a
              href={`mailto:${candidate.email}`}
              className="btn btn-icon-sm btn-ghost"
              title={`Email ${candidate.name}`}
              aria-label={`Send an email to ${candidate.name}`}
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
            </a>
          ) : (
            <span className="btn btn-icon-sm btn-ghost opacity-30 pointer-events-none" title="No email in resume" aria-hidden="true">
              <Mail className="w-4 h-4" />
            </span>
          )}

          {telHref ? (
            <a
              href={telHref}
              className="btn btn-icon-sm btn-ghost"
              title={`Call ${candidate.name}`}
              aria-label={`Call ${candidate.name}`}
            >
              <Phone className="w-4 h-4" aria-hidden="true" />
            </a>
          ) : (
            <span className="btn btn-icon-sm btn-ghost opacity-30 pointer-events-none" title="No phone number in resume" aria-hidden="true">
              <Phone className="w-4 h-4" />
            </span>
          )}

          {linkedin && (
            <a
              href={linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-icon-sm btn-ghost"
              title="Open LinkedIn profile"
              aria-label={`Open ${candidate.name}'s LinkedIn profile in a new tab`}
            >
              <Linkedin className="w-4 h-4" aria-hidden="true" />
            </a>
          )}

          {github && (
            <a
              href={github}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-icon-sm btn-ghost"
              title="Open GitHub profile"
              aria-label={`Open ${candidate.name}'s GitHub profile in a new tab`}
            >
              <Github className="w-4 h-4" aria-hidden="true" />
            </a>
          )}

          {actions}
        </div>
      </div>
    </div>
  );
};

/**
 * Condensed candidate row for the dashboard. The entire row is one link.
 */
export const CandidateRow = ({ candidate }) => {
  const score = candidate.matchAnalysis?.overallScore;
  const scoreMeta = getScoreMeta(score);
  const statusMeta = getStatusMeta(candidate.hrStatus);

  return (
    <Link
      to={`/candidates/${candidate._id}`}
      className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
      aria-label={`Open profile for ${candidate.name}`}
    >
      <Avatar name={candidate.name} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-meta font-semibold text-slate-900 truncate group-hover:text-brand-700 transition-colors duration-fast">
            {candidate.name}
          </p>
          {score !== undefined && score !== null && (
            <span className={cx('text-xs font-bold tabular-nums shrink-0', scoreMeta.text)}>{score}%</span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">
          {candidate.headline || candidate.currentRole || 'Role not specified'}
          {candidate.currentLocation ? ` • ${candidate.currentLocation}` : ''}
        </p>
      </div>

      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
        <Badge variant={statusMeta.badge.replace('badge-', '')}>{statusMeta.label}</Badge>
        <span className="text-[11px] text-slate-400">{formatRelativeTime(candidate.createdAt, '')}</span>
      </div>

      <ArrowRight
        className="w-4 h-4 text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all duration-fast shrink-0"
        aria-hidden="true"
      />
    </Link>
  );
};

export default CandidateCard;
