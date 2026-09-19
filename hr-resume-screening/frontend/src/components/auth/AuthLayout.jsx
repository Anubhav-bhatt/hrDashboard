import React from 'react';
import { Sparkles } from 'lucide-react';

/**
 * The frame both sign-in and sign-up sit in.
 *
 * One layout rather than two designs: the two screens are the same task at
 * different moments, and a person who bounces between them should not feel the
 * page change shape underneath them.
 *
 * The brand panel is deliberately quiet — a mark, a sentence, and the line about
 * who makes hiring decisions. It carried a feature list before, which is
 * marketing aimed at someone who has already decided to come in. It is hidden
 * below `lg` so the form owns the whole screen on a phone, where the form is the
 * only thing that matters.
 */
const AuthLayout = ({ title, subtitle, children, footer }) => (
  <div className="min-h-screen grid lg:grid-cols-2 bg-white">
    {/*
      Fixed `ink` palette rather than a neutral token: this surface is meant to
      stay dark in both themes, and a token would invert it to light.
    */}
    <div className="hidden lg:flex flex-col justify-between bg-ink-900 text-slate-50 p-12 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, #38aaf5 0, transparent 45%), radial-gradient(circle at 80% 70%, #0270c4 0, transparent 40%)'
        }}
        aria-hidden="true"
      />

      <div className="relative flex items-center gap-3">
        <div className="w-10 h-10 rounded-control bg-brand-600 flex items-center justify-center">
          <Sparkles className="w-5 h-5" aria-hidden="true" />
        </div>
        <span className="text-lg font-bold tracking-tight">HR Screening</span>
      </div>

      <div className="relative max-w-md">
        <h2 className="text-3xl font-bold tracking-tight leading-tight text-ink-100">
          Screen every applicant against the role, not a gut feeling.
        </h2>
        <p className="text-ink-300 text-body mt-4 leading-relaxed">
          Import resumes, score them against your job description with an explainable model, and move the
          right people forward faster.
        </p>
      </div>

      <p className="relative text-xs text-ink-400">
        Scoring is a decision-support signal. Hiring decisions remain with your recruiters.
      </p>
    </div>

    <div className="flex items-center justify-center p-6 sm:p-12">
      <div className="w-full max-w-sm">
        {/* The mark comes back on small screens, where the panel is gone. */}
        <div className="lg:hidden flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-control bg-brand-600 flex items-center justify-center text-white">
            <Sparkles className="w-[18px] h-[18px]" aria-hidden="true" />
          </div>
          <span className="text-base font-bold tracking-tight text-slate-900">HR Screening</span>
        </div>

        <h1 className="text-page-title">{title}</h1>
        {subtitle && <p className="text-meta text-slate-500 mt-1.5">{subtitle}</p>}

        {children}

        {footer && <div className="text-meta text-slate-600 mt-6">{footer}</div>}
      </div>
    </div>
  </div>
);

export default AuthLayout;
