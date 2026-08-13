import React from 'react';
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  Calendar,
  ExternalLink,
  Github,
  GraduationCap,
  Languages,
  MapPin,
  Sparkles,
  Trophy
} from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, cx } from '../ui';
import { formatDuration, formatUrlLabel, groupSkills, safeExternalUrl } from '../../utils/format';

/**
 * Section shell. Renders its own empty message when the resume had nothing for
 * this section, which is honest and keeps the layout consistent.
 */
export const ProfileSection = ({ title, description, icon: Icon, count, isEmpty, emptyMessage, actions, children, className }) => (
  <Card padding="p-0" className={className}>
    <div className="px-5 py-4 border-b border-slate-100">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-slate-400" aria-hidden="true" />}
            {title}
            {count !== undefined && count !== null && count > 0 && (
              <span className="text-meta font-normal text-slate-400">({count})</span>
            )}
          </span>
        }
        description={description}
        actions={actions}
      />
    </div>

    <div className="px-5 py-4">
      {isEmpty ? (
        <p className="text-meta text-slate-400 italic py-1">{emptyMessage || 'Not provided in the resume.'}</p>
      ) : (
        children
      )}
    </div>
  </Card>
);

/* -------------------------------------------------------------- experience --- */

export const CandidateExperience = ({ experience = [] }) => (
  <ProfileSection
    title="Work experience"
    icon={Briefcase}
    count={experience.length}
    isEmpty={experience.length === 0}
    emptyMessage="No employment history could be read from this resume."
  >
    <ol className="relative space-y-6">
      {experience.map((entry, index) => (
        <li key={`${entry.title || 'role'}-${index}`} className="relative pl-6">
          {/* Timeline rail */}
          <span
            className={cx(
              'absolute left-0 top-1.5 w-2.5 h-2.5 rounded-pill ring-4 ring-white',
              entry.isCurrent ? 'bg-emerald-500' : 'bg-slate-300'
            )}
            aria-hidden="true"
          />
          {index < experience.length - 1 && (
            <span className="absolute left-[4.5px] top-5 bottom-[-1.5rem] w-px bg-slate-200" aria-hidden="true" />
          )}

          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-card-title text-slate-900">{entry.title || 'Role not specified'}</h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-meta text-slate-600">
                {entry.company && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    {entry.company}
                  </span>
                )}
                {entry.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    {entry.location}
                  </span>
                )}
                {entry.employmentType && <Badge variant="neutral">{entry.employmentType}</Badge>}
              </div>
            </div>

            <div className="text-right shrink-0">
              {(entry.startDate || entry.endDate) && (
                <p className="text-meta font-medium text-slate-700 whitespace-nowrap">
                  {entry.startDate || '?'} – {entry.endDate || 'Not stated'}
                </p>
              )}
              {entry.durationMonths ? (
                <p className="text-xs text-slate-400 mt-0.5">{formatDuration(entry.durationMonths)}</p>
              ) : null}
              {entry.isCurrent && <Badge variant="success" className="mt-1">Current</Badge>}
            </div>
          </div>

          {entry.highlights?.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {entry.highlights.map((highlight, hIndex) => (
                <li key={hIndex} className="flex gap-2 text-meta text-slate-600 leading-relaxed">
                  <span className="text-slate-300 mt-1.5 shrink-0" aria-hidden="true">•</span>
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  </ProfileSection>
);

/* --------------------------------------------------------------- education --- */

export const CandidateEducation = ({ education = [], fallback = [] }) => {
  // When structured parsing found nothing, fall back to the plain strings the
  // extractor stored rather than showing an empty section.
  const useFallback = education.length === 0 && fallback.length > 0;

  return (
    <ProfileSection
      title="Education"
      icon={GraduationCap}
      count={education.length || fallback.length}
      isEmpty={education.length === 0 && fallback.length === 0}
      emptyMessage="No education details could be read from this resume."
    >
      {useFallback ? (
        <ul className="space-y-2">
          {fallback.map((item, index) => (
            <li key={index} className="text-body text-slate-800">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-4">
          {education.map((entry, index) => (
            <li key={index} className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-card-title text-slate-900">
                  {entry.degree || 'Qualification not specified'}
                  {entry.specialisation && <span className="font-normal text-slate-600"> — {entry.specialisation}</span>}
                </h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-meta text-slate-600">
                  {entry.institution && <span>{entry.institution}</span>}
                  {entry.location && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      {entry.location}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                {(entry.startYear || entry.endYear) && (
                  <p className="text-meta font-medium text-slate-700 whitespace-nowrap inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    {entry.startYear && entry.endYear && entry.startYear !== entry.endYear
                      ? `${entry.startYear} – ${entry.endYear}`
                      : entry.endYear || entry.startYear}
                  </p>
                )}
                {entry.grade && <Badge variant="info" className="mt-1">{entry.grade}</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ProfileSection>
  );
};

/* ------------------------------------------------------------------ skills --- */

export const CandidateSkills = ({ skills = [], matchedSkills = [], missingSkills = [] }) => {
  const { grouped, groups } = groupSkills(skills);
  const matchedSet = new Set(matchedSkills.map((s) => String(s).toLowerCase()));

  const renderSkill = (skill) => {
    const isMatch = matchedSet.has(String(skill).toLowerCase());
    return (
      <span
        key={skill}
        className={cx('chip', isMatch && 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold')}
        title={isMatch ? 'Matches a requirement for this job' : undefined}
      >
        {isMatch && <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />}
        {skill}
      </span>
    );
  };

  return (
    <ProfileSection
      title="Skills"
      icon={Sparkles}
      count={skills.length}
      description={matchedSkills.length > 0 ? 'Highlighted skills match this job’s requirements.' : undefined}
      isEmpty={skills.length === 0}
      emptyMessage="No recognised technical skills were found in this resume."
    >
      {grouped ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.name}>
              <h3 className="text-label uppercase text-slate-500 mb-2">{group.name}</h3>
              <div className="flex flex-wrap gap-1.5">{group.items.map(renderSkill)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">{skills.map(renderSkill)}</div>
      )}

      {missingSkills.length > 0 && (
        <div className="mt-5 pt-4 divider">
          <h3 className="text-label uppercase text-slate-500 mb-2">
            Required skills not found in this resume ({missingSkills.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {missingSkills.map((skill) => (
              <span key={skill} className="chip bg-rose-50 border-rose-200 text-rose-700">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </ProfileSection>
  );
};

/* ---------------------------------------------------------------- projects --- */

export const CandidateProjects = ({ projects = [], fallback = [] }) => {
  const useFallback = projects.length === 0 && fallback.length > 0;

  return (
    <ProfileSection
      title="Projects"
      icon={Award}
      count={projects.length || fallback.length}
      isEmpty={projects.length === 0 && fallback.length === 0}
      emptyMessage="No project section was found in this resume."
    >
      {useFallback ? (
        <ul className="space-y-2">
          {fallback.map((item, index) => (
            <li key={index} className="text-body text-slate-800">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-4">
          {projects.map((project, index) => {
            const url = safeExternalUrl(project.url);
            const repo = safeExternalUrl(project.repositoryUrl);

            return (
              <li key={index}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-card-title text-slate-900">{project.name || `Project ${index + 1}`}</h3>
                  {project.role && <Badge variant="neutral">{project.role}</Badge>}
                </div>

                {project.description && (
                  <p className="text-meta text-slate-600 mt-1 leading-relaxed">{project.description}</p>
                )}

                {project.technologies?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {project.technologies.map((tech, tIndex) => (
                      <span key={`${tech}-${tIndex}`} className="chip py-0.5 text-[11px]">
                        {tech}
                      </span>
                    ))}
                  </div>
                )}

                {(url || repo) && (
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="link text-meta inline-flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        {formatUrlLabel(url, 30)}
                      </a>
                    )}
                    {repo && (
                      <a href={repo} target="_blank" rel="noopener noreferrer" className="link text-meta inline-flex items-center gap-1.5">
                        <Github className="w-3.5 h-3.5" aria-hidden="true" />
                        {formatUrlLabel(repo, 30)}
                      </a>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ProfileSection>
  );
};

/* ---------------------------------------------------------- certifications --- */

export const CandidateCertifications = ({ certifications = [] }) => (
  <ProfileSection
    title="Certifications"
    icon={BadgeCheck}
    count={certifications.length}
    isEmpty={certifications.length === 0}
    emptyMessage="No certifications were listed in this resume."
  >
    <ul className="space-y-3.5">
      {certifications.map((cert, index) => {
        const url = safeExternalUrl(cert.credentialUrl);

        return (
          <li key={index} className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-meta font-semibold text-slate-900">{cert.name}</h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-slate-500">
                {cert.issuer && <span>{cert.issuer}</span>}
                {cert.credentialId && <span className="font-mono">ID: {cert.credentialId}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {cert.issueDate && <Badge variant="neutral">{cert.issueDate}</Badge>}
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-ghost"
                  aria-label={`Verify ${cert.name} (opens in a new tab)`}
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  Verify
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  </ProfileSection>
);

/* --------------------------------------------------- languages & achievements */

export const CandidateLanguages = ({ languages = [] }) => (
  <ProfileSection
    title="Languages"
    icon={Languages}
    count={languages.length}
    isEmpty={languages.length === 0}
    emptyMessage="No languages were listed in this resume."
  >
    <ul className="flex flex-wrap gap-2">
      {languages.map((language) => (
        <li key={language.name} className="chip">
          <span className="font-semibold">{language.name}</span>
          {language.proficiency && <span className="text-slate-500">· {language.proficiency}</span>}
        </li>
      ))}
    </ul>
  </ProfileSection>
);

export const CandidateAchievements = ({ achievements = [] }) => (
  <ProfileSection
    title="Achievements & recognition"
    icon={Trophy}
    count={achievements.length}
    isEmpty={achievements.length === 0}
    emptyMessage="No achievements or awards were listed in this resume."
  >
    <ul className="space-y-2">
      {achievements.map((item, index) => (
        <li key={index} className="flex gap-2 text-meta text-slate-700 leading-relaxed">
          <Trophy className="w-3.5 h-3.5 text-amber-500 mt-1 shrink-0" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </ProfileSection>
);

/* ----------------------------------------------------------------- summary --- */

export const CandidateSummary = ({ summary, extractionWarnings = [] }) => (
  <ProfileSection
    title="Professional summary"
    icon={Sparkles}
    isEmpty={!summary}
    emptyMessage="This resume does not contain a summary or career objective section."
  >
    <p className="text-body text-slate-700 leading-relaxed whitespace-pre-line">{summary}</p>

    {extractionWarnings.length > 0 && (
      <details className="mt-4 pt-4 divider">
        <summary className="text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 transition-colors duration-fast">
          Parsing notes ({extractionWarnings.length})
        </summary>
        <ul className="mt-2 space-y-1">
          {extractionWarnings.map((warning, index) => (
            <li key={index} className="text-xs text-slate-500 flex gap-1.5">
              <span aria-hidden="true">•</span>
              {warning}
            </li>
          ))}
        </ul>
      </details>
    )}
  </ProfileSection>
);

export { EmptyState };
