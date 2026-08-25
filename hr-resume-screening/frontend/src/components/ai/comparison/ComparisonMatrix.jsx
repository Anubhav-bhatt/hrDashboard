import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../ui';

/**
 * The comparison matrix, in two genuinely different layouts.
 *
 * Desktop is a real `<table>` with a sticky criteria column. Tabular data is
 * what this is, so the table element is the correct one: a screen reader
 * announces "React, required skill, Rahul Sharma: matches" because the row and
 * column headers are marked up as headers, which a grid of styled divs cannot
 * do at any price.
 *
 * Narrow screens get a different structure rather than the same table squeezed.
 * Five candidates at `min-w-[12rem]` is a 60rem-wide table, and putting that
 * behind a horizontal scrollbar on a 375px phone means comparing two candidates
 * requires scrolling one off screen — the one thing a comparison must never do.
 * So below `lg` the same data is grouped by criterion, with every candidate's
 * value for that criterion listed together and legible at once.
 *
 * Both layouts render from one `criteria` array. There is no second data path and
 * no duplicated decision about what a status means.
 */

/**
 * How each status reads.
 *
 * `text` is not decoration — it is the accessible name. The glyph and the tint
 * are redundant encodings on top of a word, so the meaning survives greyscale,
 * colour blindness and a screen reader.
 */
const STATUS_META = {
  MATCH: { text: 'Match', glyph: '✓', tone: 'text-emerald-700', dot: 'bg-emerald-500' },
  PARTIAL: { text: 'Partial', glyph: '◐', tone: 'text-amber-800', dot: 'bg-amber-500' },
  GAP: { text: 'Gap', glyph: '—', tone: 'text-rose-700', dot: 'bg-rose-400' },
  UNKNOWN: { text: 'Not stated', glyph: '·', tone: 'text-slate-500', dot: 'bg-slate-300' },
  INSUFFICIENT_DATA: { text: 'No data', glyph: '·', tone: 'text-slate-500', dot: 'bg-slate-300' }
};

const metaFor = (status) => STATUS_META[status] || STATUS_META.UNKNOWN;

/**
 * Criteria that decide the comparison, versus criteria that colour it in.
 *
 * The score, the fit band, the mandatory skills and the experience floor are
 * what a hiring decision turns on, so they are always visible. Preferred skills
 * are real signal but secondary, and on a role with a dozen of them they would
 * bury the four rows that matter — so they sit behind a disclosure.
 */
const PRIMARY_TYPES = new Set(['score', 'fit', 'experience', 'required_skill']);

const isPrimary = (criterion) => PRIMARY_TYPES.has(criterion.type);

/** One cell's content, shared by both layouts. */
const StatusValue = ({ status, evidence, className }) => {
  const meta = metaFor(status);
  return (
    <span className={cx('inline-flex items-baseline gap-1.5 min-w-0', className)}>
      <span aria-hidden="true" className={cx('shrink-0 font-bold', meta.tone)}>
        {meta.glyph}
      </span>
      <span className="min-w-0">
        {/* The status word is present for assistive technology and for anyone
            reading without colour, but visually the evidence is the useful part,
            so the word is only shown when there is no evidence to show. */}
        <span className="sr-only">{meta.text}. </span>
        <span className={cx('text-meta', evidence ? 'text-slate-800' : meta.tone)}>
          {evidence || meta.text}
        </span>
      </span>
    </span>
  );
};

const ComparisonMatrix = ({ criteria = [], candidates = [], className }) => {
  const [showAll, setShowAll] = useState(false);

  const { primary, secondary } = useMemo(() => {
    const p = [];
    const s = [];
    for (const criterion of criteria) {
      (isPrimary(criterion) ? p : s).push(criterion);
    }
    return { primary: p, secondary: s };
  }, [criteria]);

  const visible = showAll ? [...primary, ...secondary] : primary;

  if (criteria.length === 0 || candidates.length === 0) return null;

  const valueFor = (criterion, candidateId) =>
    (criterion.values || []).find((v) => v.candidateId === candidateId);

  return (
    <section aria-labelledby="comparison-matrix-heading" className={cx('min-w-0', className)}>
      <h3 id="comparison-matrix-heading" className="section-title">
        Key comparison
      </h3>
      <p className="text-meta text-slate-500 mt-0.5">
        Match score, fit and every mandatory requirement, side by side.
      </p>

      {/* ------------------------------------------------- desktop: real table */}
      <div className="mt-4 hidden lg:block card p-0 overflow-hidden">
        <div className="overflow-x-auto scroll-slim">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Comparison of {candidates.length} candidates across {visible.length} hiring criteria
            </caption>
            <thead>
              <tr className="border-b border-slate-200">
                <th
                  scope="col"
                  className="sticky left-0 z-20 bg-white py-3 px-5 w-56 min-w-[14rem] text-label uppercase text-slate-500"
                >
                  Criterion
                </th>
                {candidates.map((candidate) => (
                  <th
                    key={candidate.candidateId}
                    scope="col"
                    className="py-3 px-5 min-w-[11rem] align-bottom"
                  >
                    <span className="block text-card-title text-slate-900 truncate">
                      {candidate.candidateName}
                    </span>
                    <span className="block text-meta font-normal text-slate-500 tabular-nums">
                      {typeof candidate.matchScore === 'number' ? `${candidate.matchScore}% match` : 'Unscored'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((criterion) => (
                <tr key={criterion.criterion + criterion.type} className="hover:bg-slate-50/60 transition-colors duration-fast">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white py-3 px-5 text-left align-top font-normal"
                  >
                    <span className="block text-meta font-bold text-slate-800">
                      {criterion.label || criterion.criterion}
                    </span>
                  </th>
                  {candidates.map((candidate) => {
                    const value = valueFor(criterion, candidate.candidateId);
                    return (
                      <td key={candidate.candidateId} className="py-3 px-5 align-top">
                        <StatusValue status={value?.status} evidence={value?.evidence} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------- narrow: one criterion at a time, stacked */}
      <div className="mt-4 lg:hidden card p-0 divide-y divide-slate-100">
        {visible.map((criterion) => (
          <div key={criterion.criterion + criterion.type} className="px-4 py-3.5">
            <p className="text-meta font-bold text-slate-800">{criterion.label || criterion.criterion}</p>
            <ul className="mt-2 space-y-1.5">
              {candidates.map((candidate) => {
                const value = valueFor(criterion, candidate.candidateId);
                const meta = metaFor(value?.status);
                return (
                  <li key={candidate.candidateId} className="flex items-baseline gap-3">
                    <span
                      className={cx('mt-1.5 w-1.5 h-1.5 rounded-pill shrink-0', meta.dot)}
                      aria-hidden="true"
                    />
                    <span className="text-meta text-slate-600 w-28 shrink-0 truncate">
                      {candidate.candidateName}
                    </span>
                    <StatusValue status={value?.status} evidence={value?.evidence} className="min-w-0 flex-1" />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/*
        The remaining criteria — preferred skills — behind one control.
        The label is deliberately the same phrase in both states so the control
        does not appear to change identity when it is toggled.
      */}
      {secondary.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((open) => !open)}
          aria-expanded={showAll}
          className="mt-3 inline-flex items-center gap-1.5 text-meta font-bold text-brand-700
                     hover:text-brand-800 rounded focus-visible:outline-none
                     focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Detailed criteria breakdown
          <span className="font-normal text-slate-500">
            ({secondary.length} preferred {secondary.length === 1 ? 'skill' : 'skills'})
          </span>
          <ChevronDown
            className={cx('w-4 h-4 transition-transform duration-fast', showAll && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      )}
    </section>
  );
};

export { STATUS_META, metaFor };
export default ComparisonMatrix;
