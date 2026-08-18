import React from 'react';
import { cx } from '../ui';

/**
 * Side-by-side candidate comparison, ready for the next phase to fill.
 *
 * Attributes run down the rows and candidates across the columns: Skills,
 * Experience, Score, Education, Location, Strengths, Gaps. Comparing two people
 * on one attribute means reading across a single line, which is the whole reason
 * to lay a comparison out this way rather than as stacked profiles.
 *
 * Five candidates will not fit across a phone. Rather than shrinking the text,
 * the table scrolls horizontally inside its own container — the page itself never
 * scrolls sideways — and the attribute column is pinned so a reader always knows
 * which row they are on. That is the one place a horizontal scroll is the right
 * answer: the alternative, one card per candidate, destroys the comparison.
 */

const ATTRIBUTES = [
  { key: 'skills', label: 'Skills' },
  { key: 'experience', label: 'Experience' },
  { key: 'score', label: 'Score' },
  { key: 'education', label: 'Education' },
  { key: 'location', label: 'Location' },
  { key: 'strengths', label: 'Strengths' },
  { key: 'gaps', label: 'Gaps' }
];

const Cell = ({ value }) => {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-400 italic">—</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400 italic">—</span>;
    return (
      <ul className="space-y-0.5">
        {value.slice(0, 5).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return <>{value}</>;
};

/**
 * @param {Object} props
 * @param {Array<{candidateId: string, name: string, attributes: Object}>} props.candidates
 */
const ComparisonResultGrid = ({ candidates = [], className }) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  return (
    <div className={cx('card p-0 overflow-x-auto scroll-slim', className)}>
      <table className="table">
        <thead>
          <tr>
            {/* Pinned so the attribute stays visible while the candidate columns
                scroll beneath the reader's finger. */}
            <th scope="col" className="sticky left-0 z-20 bg-slate-50/95 backdrop-blur w-32 min-w-[8rem]">
              Attribute
            </th>
            {candidates.map((candidate) => (
              <th key={candidate.candidateId} scope="col" className="min-w-[12rem]">
                {candidate.name || 'Unnamed candidate'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ATTRIBUTES.map((attribute) => (
            <tr key={attribute.key}>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-white text-label uppercase text-slate-500 px-4 py-3 border-b border-slate-100 text-left align-top"
              >
                {attribute.label}
              </th>
              {candidates.map((candidate) => (
                <td key={candidate.candidateId} className="align-top text-meta text-slate-800">
                  <Cell value={candidate.attributes?.[attribute.key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ComparisonResultGrid;
