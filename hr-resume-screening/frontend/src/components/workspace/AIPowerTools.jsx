import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, GitCompare, ListOrdered, ScanSearch } from 'lucide-react';
import { useAiConfig } from '../../context/AiConfigContext';
import { buildAgentPath, SOURCE_WORKFLOWS } from '../../context/RecruitmentContext';
import { cx } from '../ui';

/**
 * The four agents, addressed with what the workspace already knows.
 *
 * These are links into the real agent routes, built by the same
 * `buildAgentPath` every other handoff uses — so a card is not a picture of an
 * agent, it is the agent, entered with the role and the candidates already
 * chosen. That is the whole point: a recruiter who has focused a role and picked
 * two people should never be asked for either again on arrival.
 *
 * A card that cannot act yet says what it needs, and says it in the card rather
 * than failing after the click.
 */

/**
 * Restrained, distinguishable accents. Each is a tint from the existing palette,
 * so every one of them re-themes with the rest of the application and none of
 * them reads as a marketing tile.
 */
const ACCENTS = {
  screening: 'bg-sky-50 text-sky-700 border-sky-100',
  ranking: 'bg-teal-50 text-teal-700 border-teal-100',
  comparison: 'bg-violet-50 text-violet-700 border-violet-100',
  insights: 'bg-amber-50 text-amber-700 border-amber-100'
};

const ToolCard = ({ tool }) => {
  const Icon = tool.icon;

  const body = (
    <>
      <span className="flex items-center gap-2 min-w-0">
        <span
          className={cx('w-7 h-7 rounded-control border flex items-center justify-center shrink-0', ACCENTS[tool.id])}
          aria-hidden="true"
        >
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="text-label uppercase tracking-wider text-slate-500">{tool.label}</span>
      </span>

      <span className="block min-w-0 mt-2.5">
        <span className="block text-meta font-bold text-slate-900 truncate">{tool.primary}</span>
        <span className="block text-xs text-slate-500 truncate mt-0.5">{tool.secondary}</span>
      </span>

      <span
        className={cx(
          'flex items-center gap-1.5 text-xs font-semibold mt-auto pt-3',
          tool.available ? 'text-brand-700' : 'text-slate-400'
        )}
      >
        {tool.available ? (
          <>
            {tool.cta}
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </>
        ) : (
          tool.blockedReason
        )}
      </span>
    </>
  );

  const shell =
    'card card-pad-sm flex flex-col text-left min-w-0 h-full transition duration-fast';

  if (!tool.available) {
    return (
      <div className={cx(shell, 'opacity-70')} aria-disabled="true">
        {body}
      </div>
    );
  }

  return (
    <Link
      to={tool.to}
      className={cx(
        shell,
        'hover:border-brand-300 hover:shadow-card-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1'
      )}
    >
      {body}
    </Link>
  );
};

const AIPowerTools = ({
  job,
  candidateCount = 0,
  selectedCandidates = [],
  screenCandidate = null,
  className
}) => {
  const { isModeEnabled } = useAiConfig();

  const jobId = job?.id || null;
  const jobTitle = job?.title || 'No role selected';
  const selectedIds = selectedCandidates.map((candidate) => candidate._id);
  const comparable = selectedIds.length >= 2 && selectedIds.length <= 5;

  const tools = [
    {
      id: 'screening',
      label: 'Screen',
      icon: ScanSearch,
      primary: screenCandidate?.name || 'No candidate chosen',
      secondary: screenCandidate ? jobTitle : 'Pick a candidate from the best fits above',
      cta: 'Screen',
      available: isModeEnabled('screening') && Boolean(jobId && screenCandidate),
      blockedReason: isModeEnabled('screening') ? 'Choose a candidate first' : 'Coming soon',
      to: buildAgentPath('screening', {
        jobId,
        candidateId: screenCandidate?._id,
        source: SOURCE_WORKFLOWS.dashboard
      })
    },
    {
      id: 'ranking',
      label: 'Rank',
      icon: ListOrdered,
      primary: jobTitle,
      secondary:
        candidateCount > 0
          ? `${candidateCount} candidate${candidateCount === 1 ? '' : 's'}`
          : 'No candidates yet',
      cta: 'Rank',
      available: isModeEnabled('ranking') && Boolean(jobId) && candidateCount > 0,
      blockedReason: isModeEnabled('ranking') ? 'No candidates to rank' : 'Coming soon',
      to: buildAgentPath('ranking', { jobId, source: SOURCE_WORKFLOWS.dashboard })
    },
    {
      id: 'comparison',
      label: 'Compare',
      icon: GitCompare,
      primary: comparable
        ? `${selectedIds.length} candidates`
        : `${selectedIds.length} selected`,
      secondary: comparable ? jobTitle : 'Select two to five candidates to compare',
      cta: 'Compare',
      available: isModeEnabled('comparison') && Boolean(jobId) && comparable,
      blockedReason: isModeEnabled('comparison') ? 'Select at least two' : 'Coming soon',
      to: buildAgentPath('comparison', {
        jobId,
        candidateIds: selectedIds,
        source: SOURCE_WORKFLOWS.dashboard
      })
    },
    {
      id: 'insights',
      label: 'Insights',
      icon: BarChart3,
      primary: jobTitle,
      secondary: 'Pipeline health and job quality',
      cta: 'View hiring insights',
      available: isModeEnabled('insights') && Boolean(jobId),
      blockedReason: isModeEnabled('insights') ? 'Select a role first' : 'Coming soon',
      to: buildAgentPath('insights', { jobId, source: SOURCE_WORKFLOWS.dashboard })
    }
  ];

  return (
    <section className={className} aria-labelledby="power-tools-heading">
      <h2 id="power-tools-heading" className="text-label uppercase tracking-wider text-slate-500 mb-2.5">
        AI tools
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </section>
  );
};

export default AIPowerTools;
