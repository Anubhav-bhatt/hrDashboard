import React, { useMemo } from 'react';
import { Activity, ExternalLink, FileText, Sparkles, StickyNote, UserSearch } from 'lucide-react';
import { Avatar, Card, CardHeader, EmptyState, cx } from '../ui';
import { formatDateTime, formatRelativeTime } from '../../utils/format';

const ENTRY_META = {
  NOTE: { icon: StickyNote, tone: 'bg-brand-50 text-brand-600' },
  IMPORTED: { icon: FileText, tone: 'bg-slate-100 text-slate-500' },
  STATUS_CHANGED: { icon: UserSearch, tone: 'bg-amber-50 text-amber-600' },
  NOTE_ADDED: { icon: StickyNote, tone: 'bg-brand-50 text-brand-600' },
  ANALYZED: { icon: Sparkles, tone: 'bg-violet-50 text-violet-600' },
  RESUME_VIEWED: { icon: ExternalLink, tone: 'bg-slate-100 text-slate-500' }
};

/** Groups entries under Today / Yesterday / a date. */
const dayLabel = (date) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const entry = new Date(date);
  const entryDay = new Date(entry.getFullYear(), entry.getMonth(), entry.getDate());
  const diffDays = Math.round((today - entryDay) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return entryDay.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Combined recruiter notes and recorded activity as one dated timeline.
 *
 * Notes and system events are interleaved chronologically because that is how a
 * recruiter reads a candidate's history — "what happened, in order" — rather than
 * as two separate lists that have to be mentally merged.
 *
 * `NOTE_ADDED` activity entries are filtered out when the note itself is
 * present, so adding a note produces one timeline item rather than two.
 */
const CandidateTimeline = ({ notes = [], activities = [], className }) => {
  const entries = useMemo(() => {
    const noteEntries = notes.map((note) => ({
      id: `note-${note.id}`,
      kind: 'NOTE',
      body: note.body,
      actorName: note.authorName,
      createdAt: note.createdAt
    }));

    const activityEntries = activities
      .filter((activity) => activity.type !== 'NOTE_ADDED' || notes.length === 0)
      .map((activity) => ({
        id: `activity-${activity.id}`,
        kind: activity.type,
        description: activity.description,
        actorName: activity.actorName,
        createdAt: activity.createdAt
      }));

    return [...noteEntries, ...activityEntries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [notes, activities]);

  const grouped = useMemo(() => {
    const groups = [];
    for (const entry of entries) {
      const label = dayLabel(entry.createdAt);
      const existing = groups.find((g) => g.label === label);
      if (existing) existing.entries.push(entry);
      else groups.push({ label, entries: [entry] });
    }
    return groups;
  }, [entries]);

  return (
    <Card padding="p-0" className={className}>
      <div className="px-5 py-4 border-b border-slate-100">
        <CardHeader
          title="History"
          description={`${notes.length} note${notes.length === 1 ? '' : 's'} and ${
            activities.length
          } recorded action${activities.length === 1 ? '' : 's'}, newest first.`}
        />
      </div>

      {entries.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={Activity}
            title="Nothing recorded yet"
            description="Notes you add and status changes you make will appear here."
            className="border-0 shadow-none py-6"
          />
        </div>
      ) : (
        <div className="px-5 py-4 space-y-5">
          {grouped.map((group) => (
            <div key={group.label}>
              <p className="text-label uppercase text-slate-400 mb-3">{group.label}</p>

              <ol className="space-y-4">
                {group.entries.map((entry, index) => {
                  const meta = ENTRY_META[entry.kind] || ENTRY_META.IMPORTED;
                  const Icon = meta.icon;
                  const isNote = entry.kind === 'NOTE';

                  return (
                    <li key={entry.id} className="relative pl-9">
                      <span
                        className={cx(
                          'absolute left-0 top-0 w-7 h-7 rounded-pill flex items-center justify-center ring-4 ring-white',
                          meta.tone
                        )}
                        aria-hidden="true"
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>

                      {/* Rail connecting entries within a day. */}
                      {index < group.entries.length - 1 && (
                        <span className="absolute left-[13px] top-8 bottom-[-1rem] w-px bg-slate-200" aria-hidden="true" />
                      )}

                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-meta font-semibold text-slate-800">{entry.actorName}</span>
                        <span className="text-meta text-slate-500">
                          {isNote ? 'added a note' : entry.description}
                        </span>
                        <span className="text-xs text-slate-400" title={formatDateTime(entry.createdAt)}>
                          · {formatRelativeTime(entry.createdAt)}
                        </span>
                      </div>

                      {isNote && (
                        // Rendered as text, never as HTML.
                        <p className="mt-1.5 rounded-control border border-slate-200 bg-slate-50 px-3 py-2 text-meta text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {entry.body}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default CandidateTimeline;
