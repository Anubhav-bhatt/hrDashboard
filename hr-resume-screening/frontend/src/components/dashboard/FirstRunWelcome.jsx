import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus, Sparkles, Users } from 'lucide-react';

/**
 * What a brand-new workspace sees instead of a dashboard.
 *
 * A dashboard with nothing in it is a wall of zeroes, and a wall of zeroes reads
 * as "something is broken" rather than "you have not started yet". So the
 * measurements are not rendered at all until there is something to measure, and
 * this takes their place.
 *
 * One primary action, deliberately. The three steps underneath are there to
 * answer "what am I in for" before the recruiter commits — they are description,
 * not a checklist to work through, and none of them is a competing button.
 */
const STEPS = [
  { icon: FileText, title: 'Create a role', detail: 'Upload the job description. The criteria are read from it.' },
  { icon: Users, title: 'Add resumes', detail: 'Upload a folder, or import from Outlook.' },
  { icon: Sparkles, title: 'Review the best matches', detail: 'Every candidate scored against that role, with the reasons.' }
];

const FirstRunWelcome = ({ name }) => {
  const firstName = String(name || '').trim().split(/\s+/)[0];

  return (
    <section
      aria-labelledby="first-run-heading"
      className="rounded-card border border-slate-200 bg-white p-6 sm:p-8"
    >
      <h2 id="first-run-heading" className="text-page-title">
        {firstName ? `Welcome, ${firstName}` : 'Welcome'}
      </h2>
      <p className="text-body text-slate-600 mt-2 max-w-prose">
        You&rsquo;re ready to start hiring. Create your first job and you can begin reviewing candidates
        against it straight away.
      </p>

      <Link to="/jobs/new" className="btn btn-lg btn-primary mt-5">
        <Plus className="w-4 h-4" aria-hidden="true" />
        Create your first job
      </Link>

      <div className="mt-8 pt-6 border-t border-slate-100">
        <h3 className="section-title">How it works</h3>
        <ol className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STEPS.map(({ icon: Icon, title, detail }, index) => (
            <li key={title} className="flex gap-3">
              <span
                className="w-8 h-8 rounded-pill bg-brand-50 text-brand-700 flex items-center justify-center shrink-0 font-bold text-xs tabular-nums"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-meta font-semibold text-slate-900 flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  {title}
                </p>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default FirstRunWelcome;
