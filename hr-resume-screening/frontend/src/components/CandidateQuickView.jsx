import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { Avatar, Badge, Button, cx } from './ui';

const FIT_BADGES = {
  VERY_STRONG: { label: 'Very Strong', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  STRONG: { label: 'Strong', bg: 'bg-teal-50 text-teal-700 border-teal-200' },
  MODERATE: { label: 'Moderate', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  WEAK: { label: 'Weak', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  INSUFFICIENT_DATA: { label: 'Unscored', bg: 'bg-slate-50 text-slate-700 border-slate-200' }
};

export const CandidateQuickView = ({
  candidate,
  jobId,
  isOpen,
  onClose,
  onStatusChange
}) => {
  const navigate = useNavigate();

  if (!isOpen || !candidate) return null;

  const score = candidate.overallScore ?? candidate.matchScore ?? candidate.score;
  const isScored = typeof score === 'number';
  const fitKey = candidate.fitLevel || (isScored ? (score >= 90 ? 'VERY_STRONG' : score >= 80 ? 'STRONG' : score >= 65 ? 'MODERATE' : 'WEAK') : 'INSUFFICIENT_DATA');
  const fit = FIT_BADGES[fitKey] || FIT_BADGES.MODERATE;

  const skills = Array.isArray(candidate.skills)
    ? candidate.skills
    : typeof candidate.skills === 'string'
    ? candidate.skills.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const handleOpenFullProfile = () => {
    onClose();
    navigate(`/candidates/${candidate.id || candidate.candidateId}`);
  };

  const handleScreenWithAi = () => {
    onClose();
    const effectiveJobId = jobId || candidate.jobId;
    const effectiveCandidateId = candidate.id || candidate.candidateId;
    navigate(`/ai/screening?jobId=${effectiveJobId}&candidateId=${effectiveCandidateId}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-950/40 backdrop-blur-xs flex justify-end animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Candidate Quick View"
    >
      <div
        className="w-full max-w-md bg-white border-l border-slate-200 h-full flex flex-col shadow-2xl overflow-hidden animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900">
              Candidate Quick View
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto scroll-slim p-5 space-y-5">
          {/* Profile Overview */}
          <div className="flex items-start gap-3">
            <Avatar name={candidate.name || 'Unnamed candidate'} size="lg" />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-900 truncate">
                {candidate.name || 'Unnamed candidate'}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                {candidate.currentRole || candidate.title || 'Applicant'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${fit.bg}`}>
                  {fit.label}
                </span>
                {candidate.status && (
                  <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-100 rounded">
                    {candidate.status}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200/80">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Match Score</p>
              <p className="text-base font-extrabold text-brand-600 mt-0.5">
                {isScored ? `${score}%` : 'Unscored'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Experience</p>
              <p className="text-base font-bold text-slate-800 mt-0.5">
                {candidate.experienceYears ?? candidate.experience ?? '—'} yrs
              </p>
            </div>
          </div>

          {/* Contact Details */}
          <div className="space-y-2 text-xs text-slate-600">
            {candidate.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{candidate.email}</span>
              </div>
            )}
            {candidate.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{candidate.phone}</span>
              </div>
            )}
            {candidate.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{candidate.location}</span>
              </div>
            )}
          </div>

          {/* Skills Breakdown */}
          {skills.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Parsed Skills ({skills.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resume Summary / Note */}
          {candidate.summary && (
            <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 border border-slate-100">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Profile Summary
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                {candidate.summary}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/80 flex flex-col gap-2">
          <Button
            variant="primary"
            className="w-full justify-center text-xs"
            icon={ExternalLink}
            onClick={handleOpenFullProfile}
          >
            View Full Candidate Profile
          </Button>

          {(jobId || candidate.jobId) && (
            <Button
              variant="secondary"
              className="w-full justify-center text-xs"
              icon={Search}
              onClick={handleScreenWithAi}
            >
              Screen Candidate with AI
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CandidateQuickView;
