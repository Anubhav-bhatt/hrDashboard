import React from 'react';
import { cx } from './index';

/**
 * Numbered form section.
 *
 * Gives a long single-page form visible structure without turning it into a
 * wizard. The number is intentionally quiet — a small monospaced marker beside
 * the heading rather than a large badge that competes with the title.
 *
 * @param {Object} props
 * @param {string} props.step Two-digit marker, e.g. "01"
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {boolean} [props.optional] Marks the whole section as optional
 * @param {React.ReactNode} [props.aside] Rendered on the right of the heading
 */
const FormSection = ({ step, title, description, optional = false, aside, children, className }) => (
  <section className={cx('card card-pad-lg', className)} aria-labelledby={`section-${step}`}>
    <div className="flex flex-wrap items-start justify-between gap-3 pb-4 divider">
      <div className="flex items-start gap-3 min-w-0">
        <span className="font-mono text-meta font-semibold text-slate-300 leading-6 select-none" aria-hidden="true">
          {step}
        </span>
        <div className="min-w-0">
          <h2 id={`section-${step}`} className="text-section inline-flex items-center gap-2 flex-wrap">
            {title}
            {optional && <span className="badge badge-neutral font-normal">Optional</span>}
          </h2>
          {description && <p className="text-meta text-slate-500 mt-1">{description}</p>}
        </div>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>

    <div className="pt-5">{children}</div>
  </section>
);

export default FormSection;
