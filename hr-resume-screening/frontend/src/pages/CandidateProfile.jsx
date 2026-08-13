import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity,
  Briefcase,
  Building2,
  Calendar,
  Download,
  ExternalLink,
  FileText,
  IndianRupee,
  Linkedin,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  StickyNote,
  User,
  UserSearch
} from 'lucide-react';
import {
  addCandidateNote,
  analyzeCandidate,
  downloadCandidateResume,
  getCandidateProfile,
  getCandidateResumeUrl,
  toApiError,
  updateCandidateStatus
} from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastProvider';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  ErrorState,
  ProfileSkeleton,
  Tabs,
  TabPanel
} from '../components/ui';
import CandidateContactCard from '../components/candidate/CandidateContactCard';
import CandidateMatchPanel from '../components/candidate/CandidateMatchPanel';
import CandidateResumeViewer from '../components/candidate/CandidateResumeViewer';
import OutreachDialog from '../components/candidate/OutreachDialog';
import {
  CandidateAchievements,
  CandidateCertifications,
  CandidateEducation,
  CandidateExperience,
  CandidateLanguages,
  CandidateProjects,
  CandidateSkills,
  CandidateSummary
} from '../components/candidate/CandidateSections';
import {
  HR_STATUS_META,
  formatDate,
  formatDateTime,
  formatExperience,
  formatPhone,
  formatRelativeTime,
  formatSalary,
  getStatusMeta,
  safeExternalUrl,
  toTelHref
} from '../utils/format';

const TAB_IDS = ['overview', 'experience', 'skills', 'resume', 'notes', 'activity'];

const ACTIVITY_ICONS = {
  IMPORTED: FileText,
  STATUS_CHANGED: UserSearch,
  NOTE_ADDED: StickyNote,
  ANALYZED: Sparkles,
  RESUME_VIEWED: ExternalLink
};

/**
 * Candidate profile.
 *
 * A dedicated route (/candidates/:candidateId) rather than a drawer, so a
 * recruiter can deep-link, refresh and share a profile. Everything on screen
 * comes from the candidate record and their parsed resume; sections the resume
 * did not contain say so explicitly.
 */
const CandidateProfile = () => {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();

  const tabFromUrl = searchParams.get('tab');
  const activeTab = TAB_IDS.includes(tabFromUrl) ? tabFromUrl : 'overview';

  const [analyzing, setAnalyzing] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [showOutreach, setShowOutreach] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { data, error, loading, refetch, setData } = useApiResource(
    (config) => getCandidateProfile(candidateId, config),
    [candidateId]
  );

  const candidate = data?.data;

  // Reflect the candidate's name in the tab title for easier window switching.
  useEffect(() => {
    if (candidate?.name) {
      const previous = document.title;
      document.title = `${candidate.name} · Resume Screening`;
      return () => {
        document.title = previous;
      };
    }
    return undefined;
  }, [candidate?.name]);

  const setTab = (tab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === 'overview') next.delete('tab');
        else next.set('tab', tab);
        return next;
      },
      { replace: true }
    );
  };

  const handleStatusChange = async (status) => {
    if (!candidate || status === candidate.hrStatus) return;
    const previous = candidate.hrStatus;

    setStatusSaving(true);
    setData((current) =>
      current ? { ...current, data: { ...current.data, hrStatus: status } } : current
    );

    try {
      await updateCandidateStatus(candidate.jobId, candidate._id, status);
      toast.success(`Status updated to ${HR_STATUS_META[status]?.label || status}.`);
      refetch();
    } catch (err) {
      setData((current) => (current ? { ...current, data: { ...current.data, hrStatus: previous } } : current));
      toast.error(toApiError(err).message);
    } finally {
      setStatusSaving(false);
    }
  };

  const handleReanalyze = async () => {
    if (!candidate) return;
    setAnalyzing(true);
    try {
      await analyzeCandidate(candidate.jobId, candidate._id);
      await refetch();
      toast.success('Relevance score recalculated.');
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddNote = async (event) => {
    event.preventDefault();
    const body = noteBody.trim();
    if (!body || !candidate) return;

    setNoteSaving(true);
    try {
      await addCandidateNote(candidate.jobId, candidate._id, body);
      setNoteBody('');
      await refetch();
      toast.success('Note added.');
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setNoteSaving(false);
    }
  };

  const handleDownloadResume = async () => {
    if (!candidate) return;
    setDownloading(true);
    try {
      await downloadCandidateResume(candidate.jobId, candidate._id, candidate.resume?.fileName || 'resume');
      toast.success('Resume download started.');
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setDownloading(false);
    }
  };

  const tabs = useMemo(() => {
    if (!candidate) return [];
    return [
      { id: 'overview', label: 'Overview', icon: User },
      { id: 'experience', label: 'Experience', icon: Briefcase, count: candidate.experience?.length || 0 },
      { id: 'skills', label: 'Skills', icon: Sparkles, count: candidate.skills?.length || 0 },
      { id: 'resume', label: 'Resume', icon: FileText },
      { id: 'notes', label: 'Notes', icon: StickyNote, count: candidate.noteEntries?.length || 0 },
      { id: 'activity', label: 'Activity', icon: Activity, count: candidate.activities?.length || 0 }
    ];
  }, [candidate]);

  /* ------------------------------------------------------------- states --- */

  if (loading) {
    return (
      <div className="space-y-5">
        <Link to="/candidates" className="inline-flex items-center gap-1.5 text-meta font-medium text-slate-500 hover:text-slate-900 transition-colors duration-fast">
          <span aria-hidden="true">←</span> Candidates
        </Link>
        <ProfileSkeleton />
      </div>
    );
  }

  if (error) {
    const notFound = error.status === 404;
    return (
      <div className="space-y-5">
        <Link to="/candidates" className="inline-flex items-center gap-1.5 text-meta font-medium text-slate-500 hover:text-slate-900 transition-colors duration-fast">
          <span aria-hidden="true">←</span> Candidates
        </Link>

        {notFound ? (
          <EmptyState
            icon={UserSearch}
            title="Candidate not found"
            description="This candidate profile does not exist, or it may have been removed along with its job."
            action={
              <>
                <Link to="/candidates" className="btn btn-sm btn-primary">
                  Back to candidates
                </Link>
                <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
                  Go back
                </Button>
              </>
            }
          />
        ) : (
          <ErrorState title="Unable to load this candidate profile" error={error} onRetry={refetch} />
        )}
      </div>
    );
  }

  if (!candidate) return null;

  /* -------------------------------------------------------------- render --- */

  const personal = candidate.personal || {};
  const professional = candidate.professional || {};
  const application = candidate.application || {};
  const statusMeta = getStatusMeta(candidate.hrStatus);
  const linkedin = safeExternalUrl(personal.linkedin);
  const telHref = toTelHref(personal.phone);

  return (
    <div className="space-y-5">
      <Link
        to="/candidates"
        className="inline-flex items-center gap-1.5 text-meta font-medium text-slate-500 hover:text-slate-900 transition-colors duration-fast w-fit"
      >
        <span aria-hidden="true">←</span> Candidates
      </Link>

      {/* Profile header: identity, status, and every primary action */}
      <Card padding="card-pad-lg">
        <div className="flex flex-col sm:flex-row gap-5">
          <Avatar name={candidate.name} size="xl" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-page-title sm:text-display">{candidate.name}</h1>
                <p className="text-body text-slate-600 mt-1">
                  {professional.headline || professional.currentRole || 'Role not specified in resume'}
                  {professional.currentCompany && (
                    <span className="text-slate-500"> at {professional.currentCompany}</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={statusMeta.badge.replace('badge-', '')}>{statusMeta.label}</Badge>
                {candidate.matchAnalysis && (
                  <Badge variant="brand">{candidate.matchAnalysis.overallScore}% match</Badge>
                )}
              </div>
            </div>

            {/* Contact strip — the fastest read of who and where */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-meta text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                {personal.currentLocation || <span className="text-slate-400 italic">Location not provided</span>}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                {formatExperience(professional.totalExperienceYears, 'Experience not stated')}
              </span>
              {personal.email && (
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <a href={`mailto:${personal.email}`} className="link truncate">
                    {personal.email}
                  </a>
                  <CopyButton value={personal.email} label="Copy email address" />
                </span>
              )}
              {personal.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  {telHref ? (
                    <a href={telHref} className="link">
                      {formatPhone(personal.phone)}
                    </a>
                  ) : (
                    formatPhone(personal.phone)
                  )}
                  <CopyButton value={personal.phone} label="Copy phone number" />
                </span>
              )}
            </div>

            {/* Application context */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-xs text-slate-500">
              {application.jobTitle && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  Applied for{' '}
                  <Link to={`/jobs/${application.jobId}`} className="link">
                    {application.jobTitle}
                  </Link>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                Applied {formatDate(application.appliedAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                Source: {application.source === 'OUTLOOK' ? 'Outlook mailbox' : 'Direct upload'}
              </span>
            </div>

            {/* Primary actions */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {personal.email ? (
                <Button variant="primary" size="md" icon={Send} onClick={() => setShowOutreach(true)}>
                  Email candidate
                </Button>
              ) : (
                <Button variant="primary" size="md" icon={Send} disabled title="No email address found in this resume">
                  Email candidate
                </Button>
              )}

              {telHref && (
                <a href={telHref} className="btn btn-md btn-secondary">
                  <Phone className="w-4 h-4" aria-hidden="true" />
                  Call
                </a>
              )}

              {linkedin && (
                <a href={linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-md btn-secondary">
                  <Linkedin className="w-4 h-4" aria-hidden="true" />
                  LinkedIn
                </a>
              )}

              {candidate.resume?.available ? (
                <>
                  <a
                    href={getCandidateResumeUrl(candidate.jobId, candidate._id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-md btn-secondary"
                  >
                    <FileText className="w-4 h-4" aria-hidden="true" />
                    Open resume
                  </a>
                  <Button variant="secondary" size="md" icon={Download} loading={downloading} onClick={handleDownloadResume}>
                    Download
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="md" icon={FileText} onClick={() => setTab('resume')}>
                  View resume text
                </Button>
              )}

              <Button variant="secondary" size="md" icon={MessageSquare} onClick={() => setTab('notes')}>
                Add note
              </Button>

              <label className="inline-flex items-center gap-2 ml-auto">
                <span className="text-meta text-slate-500 whitespace-nowrap">Status</span>
                <select
                  value={candidate.hrStatus || 'REVIEW'}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={statusSaving}
                  className="select h-10 w-auto min-w-[9.5rem]"
                  aria-label="Change candidate status"
                >
                  {Object.entries(HR_STATUS_META).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </Card>

      <Tabs tabs={tabs} activeId={activeTab} onChange={setTab} />

      {/* ------------------------------------------------------ Overview --- */}
      <TabPanel id="overview" activeId={activeTab}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <CandidateSummary summary={professional.summary} extractionWarnings={candidate.extractionWarnings} />

            <CandidateSkills
              skills={candidate.skills}
              matchedSkills={candidate.matchAnalysis?.matchedSkills}
              missingSkills={candidate.matchAnalysis?.missingRequiredSkills}
            />

            <CandidateExperience experience={candidate.experience} />
            <CandidateEducation education={candidate.educationDetail} fallback={candidate.education} />
          </div>

          <div className="space-y-5">
            <CandidateContactCard
              candidate={candidate}
              onCompose={() => setShowOutreach(true)}
              onCopied={() => toast.success('Contact details copied.')}
            />

            <CandidateMatchPanel candidate={candidate} onReanalyze={handleReanalyze} analyzing={analyzing} />

            {/* Compensation, only when the resume stated it */}
            {(professional.currentSalary || professional.expectedSalary) && (
              <Card>
                <CardHeader title="Compensation" description="As stated in the resume." />
                <dl className="mt-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-meta text-slate-500 inline-flex items-center gap-1.5">
                      <IndianRupee className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      Current CTC
                    </dt>
                    <dd className="text-meta font-semibold text-slate-900">
                      {formatSalary(professional.currentSalary)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-meta text-slate-500 inline-flex items-center gap-1.5">
                      <IndianRupee className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      Expected CTC
                    </dt>
                    <dd className="text-meta font-semibold text-slate-900">
                      {formatSalary(professional.expectedSalary)}
                    </dd>
                  </div>
                </dl>
              </Card>
            )}
          </div>
        </div>
      </TabPanel>

      {/* ---------------------------------------------------- Experience --- */}
      <TabPanel id="experience" activeId={activeTab}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <CandidateExperience experience={candidate.experience} />
            <CandidateProjects projects={candidate.projectsDetail} fallback={candidate.projects} />
          </div>
          <div className="space-y-5">
            <CandidateEducation education={candidate.educationDetail} fallback={candidate.education} />
            <CandidateCertifications certifications={candidate.certifications} />
          </div>
        </div>
      </TabPanel>

      {/* -------------------------------------------------------- Skills --- */}
      <TabPanel id="skills" activeId={activeTab}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <CandidateSkills
              skills={candidate.skills}
              matchedSkills={candidate.matchAnalysis?.matchedSkills}
              missingSkills={candidate.matchAnalysis?.missingRequiredSkills}
            />
            <CandidateCertifications certifications={candidate.certifications} />
          </div>
          <div className="space-y-5">
            <CandidateLanguages languages={candidate.languages} />
            <CandidateAchievements achievements={candidate.achievements} />
          </div>
        </div>
      </TabPanel>

      {/* -------------------------------------------------------- Resume --- */}
      <TabPanel id="resume" activeId={activeTab}>
        <CandidateResumeViewer candidate={candidate} />
      </TabPanel>

      {/* --------------------------------------------------------- Notes --- */}
      <TabPanel id="notes" activeId={activeTab}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardHeader title="Add a note" description="Notes are visible to everyone on your recruiting team." />
              <form onSubmit={handleAddNote} className="mt-3">
                <label htmlFor="note-body" className="sr-only">
                  Note about {candidate.name}
                </label>
                <textarea
                  id="note-body"
                  rows={4}
                  className="textarea"
                  placeholder="Screening feedback, notice period, availability, salary discussion…"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  maxLength={5000}
                />
                <div className="flex items-center justify-between gap-3 mt-2.5">
                  <p className="text-xs text-slate-400 tabular-nums">{noteBody.length} / 5000</p>
                  <Button type="submit" variant="primary" size="sm" icon={StickyNote} loading={noteSaving} disabled={!noteBody.trim()}>
                    Save note
                  </Button>
                </div>
              </form>
            </Card>

            <Card padding="p-0">
              <div className="px-5 py-4 border-b border-slate-100">
                <CardHeader title="Note history" description={`${candidate.noteEntries.length} note${candidate.noteEntries.length === 1 ? '' : 's'}`} />
              </div>

              {candidate.noteEntries.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={StickyNote}
                    title="No notes yet"
                    description="Add the first note to keep your team aligned on this candidate."
                    className="border-0 shadow-none py-6"
                  />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {candidate.noteEntries.map((note) => (
                    <li key={note.id} className="px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-meta font-semibold text-slate-800">{note.authorName}</span>
                        <span className="text-xs text-slate-400" title={formatDateTime(note.createdAt)}>
                          {formatRelativeTime(note.createdAt)}
                        </span>
                      </div>
                      {/* Rendered as text — never as HTML. */}
                      <p className="text-meta text-slate-600 mt-1.5 whitespace-pre-wrap leading-relaxed">{note.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Legacy single-field note, kept visible so nothing recorded earlier is lost */}
          {candidate.notes && (
            <Card>
              <CardHeader title="Screening summary" description="Earlier free-text note on this candidate." />
              <p className="text-meta text-slate-600 mt-3 whitespace-pre-wrap leading-relaxed">{candidate.notes}</p>
            </Card>
          )}
        </div>
      </TabPanel>

      {/* ------------------------------------------------------ Activity --- */}
      <TabPanel id="activity" activeId={activeTab}>
        <Card padding="p-0" className="max-w-3xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <CardHeader title="Recruitment activity" description="Every recorded action on this candidate, newest first." />
          </div>

          {candidate.activities.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Activity} title="No activity recorded yet" className="border-0 shadow-none py-6" />
            </div>
          ) : (
            <ol className="divide-y divide-slate-100">
              {candidate.activities.map((activity) => {
                const Icon = ACTIVITY_ICONS[activity.type] || Activity;
                return (
                  <li key={activity.id} className="px-5 py-3.5 flex items-start gap-3">
                    <span className="w-8 h-8 rounded-control bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-meta text-slate-800">{activity.description}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {activity.actorName} · <span title={formatDateTime(activity.createdAt)}>{formatRelativeTime(activity.createdAt)}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </TabPanel>

      {showOutreach && (
        <OutreachDialog
          candidate={candidate}
          jobTitle={application.jobTitle}
          recruiterName={user?.name}
          onClose={() => setShowOutreach(false)}
        />
      )}
    </div>
  );
};

export default CandidateProfile;
