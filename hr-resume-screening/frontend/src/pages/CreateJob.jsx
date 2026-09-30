import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  IndianRupee,
  Info,
  Loader2,
  Sparkles,
  UploadCloud
} from 'lucide-react';
import { createJob, updateJobCriteria, parseJobDescription, toApiError } from '../services/api';
import { useToast } from '../components/ToastProvider';
import { Button, InlineAlert, cx } from '../components/ui';
import TokenInput from '../components/ui/TokenInput';
import { formatFileSize } from '../utils/format';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const SKILL_SUGGESTIONS = [
  'React', 'TypeScript', 'JavaScript', 'Node.js', 'Express', 'PostgreSQL', 'MongoDB',
  'Python', 'Java', 'Spring Boot', 'AWS', 'Docker', 'Kubernetes', 'REST API', 'GraphQL',
  'Next.js', 'Redux', 'Tailwind CSS', 'Git', 'CI/CD', 'Jest'
];

const LOCATION_SUGGESTIONS = [
  'Gurugram', 'Noida', 'Delhi', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Chennai', 'Remote'
];

const QUALIFICATION_SUGGESTIONS = [
  'B.Tech', 'B.E.', 'MCA', 'BCA', 'B.Sc', 'MBA', 'Computer Science degree', 'Equivalent experience'
];

/**
 * Simplified Create Job Experience (/jobs/new)
 *
 * Designed with recruiter-friendly language:
 *   1. Upload or paste Job Description
 *   2. System auto-extracts requirements ("We found these in the job description")
 *   3. Simple "What are you looking for?" section (Must-have skills, Nice-to-have skills, Education)
 *   4. Collapsed "Additional preferences" for optional experience, location, and salary
 *   5. Create Job
 */
const CreateJob = () => {
  const navigate = useNavigate();
  const toast = useToast();

  // JD input mode: 'upload' | 'paste'
  const [inputMode, setInputMode] = useState('upload');
  const [file, setFile] = useState(null);
  const [pastedText, setPastedText] = useState('');

  // JD parsing states
  const [isReadingJd, setIsReadingJd] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState(null); // 'success' | 'partial' | null
  const [extractedText, setExtractedText] = useState('');
  const [showJdEditor, setShowJdEditor] = useState(false);

  // Job Title
  const [title, setTitle] = useState('');

  // What are you looking for? (Primary Criteria)
  const [requiredSkills, setRequiredSkills] = useState([]);
  const [preferredSkills, setPreferredSkills] = useState([]);
  const [qualifications, setQualifications] = useState([]);

  // Additional preferences (Progressive Disclosure)
  const [showPreferences, setShowPreferences] = useState(false);
  const [minExp, setMinExp] = useState('');
  const [maxExp, setMaxExp] = useState('');
  const [preferredLocations, setPreferredLocations] = useState([]);
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [searchKeywords, setSearchKeywords] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [missingFields, setMissingFields] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef(null);
  const titleInputRef = useRef(null);

  const hasPreferencesConfigured = Boolean(
    minExp !== '' ||
    maxExp !== '' ||
    preferredLocations.length > 0 ||
    salaryMin !== '' ||
    salaryMax !== '' ||
    searchKeywords.length > 0
  );

  // Trigger parsing from file or text
  const readJobDescription = async (fileToRead, textToRead) => {
    setIsReadingJd(true);
    setExtractionStatus(null);
    setFormError('');

    try {
      let response;
      if (fileToRead) {
        const formData = new FormData();
        formData.append('jdFile', fileToRead);
        response = await parseJobDescription(formData);
      } else if (textToRead && textToRead.trim()) {
        response = await parseJobDescription({ text: textToRead.trim() });
      } else {
        setIsReadingJd(false);
        return;
      }

      const data = response?.data;
      if (data && data.status !== 'failed') {
        setExtractedText(data.extractedText || textToRead || '');
        setMissingFields(data.missingFields || []);

        // Auto-fill title if empty or suggested
        if (data.suggestedTitle && (!title || !title.trim())) {
          setTitle(data.suggestedTitle);
        }

        // Auto-fill must-have skills
        if (Array.isArray(data.requiredSkills) && data.requiredSkills.length > 0) {
          setRequiredSkills((prev) => Array.from(new Set([...prev, ...data.requiredSkills])));
        }

        // Auto-fill nice-to-have skills
        if (Array.isArray(data.preferredSkills) && data.preferredSkills.length > 0) {
          setPreferredSkills((prev) => Array.from(new Set([...prev, ...data.preferredSkills])));
        }

        // Auto-fill qualifications
        if (Array.isArray(data.preferredEducation) && data.preferredEducation.length > 0) {
          setQualifications((prev) => Array.from(new Set([...prev, ...data.preferredEducation])));
        }

        // Auto-fill minimum experience
        if (data.minimumExperience !== undefined && data.minimumExperience !== null && data.minimumExperience > 0) {
          if (!minExp) setMinExp(String(data.minimumExperience));
          setShowPreferences(true);
        }

        // Auto-fill locations
        if (Array.isArray(data.preferredLocations) && data.preferredLocations.length > 0) {
          setPreferredLocations((prev) => Array.from(new Set([...prev, ...data.preferredLocations])));
          setShowPreferences(true);
        }

        setExtractionStatus(data.status || 'complete');
      } else {
        setMissingFields(data?.missingFields || []);
        setExtractionStatus('failed');
      }
    } catch (err) {
      setMissingFields([]);
      setExtractionStatus('failed');
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      if (msg && !msg.includes('status code')) {
        setErrors((prev) => ({ ...prev, file: msg }));
      }
    } finally {
      setIsReadingJd(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    setFormError('');

    const ext = `.${selectedFile.name.split('.').pop().toLowerCase()}`;
    if (ext === '.doc') {
      setErrors((prev) => ({ ...prev, file: 'Unsupported legacy Word format (.doc). Please save as .docx or .pdf.' }));
      return;
    }
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setErrors((prev) => ({ ...prev, file: 'Unsupported file type. Please upload a PDF, DOCX or TXT file.' }));
      return;
    }
    if (selectedFile.size > MAX_SIZE_BYTES) {
      setErrors((prev) => ({ ...prev, file: 'File exceeds 5 MB. Please upload a smaller file.' }));
      return;
    }

    setErrors((prev) => ({ ...prev, file: undefined }));
    setFile(selectedFile);
    readJobDescription(selectedFile, null);
  };

  const handleClearFile = () => {
    setFile(null);
    setExtractedText('');
    setExtractionStatus(null);
    setMissingFields([]);
    setErrors((prev) => ({ ...prev, file: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePasteExtract = () => {
    if (!pastedText.trim()) {
      setErrors((prev) => ({ ...prev, file: 'Paste job description text first.' }));
      return;
    }
    setErrors((prev) => ({ ...prev, file: undefined }));
    readJobDescription(null, pastedText);
  };

  // Submit and create job
  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    const nextErrors = {};
    if (!title.trim()) nextErrors.title = 'Job title is required.';

    let jdFileToSubmit = file;
    if (inputMode === 'paste') {
      if (!pastedText.trim()) {
        nextErrors.file = 'Please paste the job description text.';
      } else {
        jdFileToSubmit = new File([pastedText.trim()], 'job-description.txt', { type: 'text/plain' });
      }
    } else if (!file) {
      nextErrors.file = 'Attach the job description document or switch to Paste.';
    }

    const minE = minExp === '' ? null : parseFloat(minExp);
    const maxE = maxExp === '' ? null : parseFloat(maxExp);
    const salMin = salaryMin === '' ? null : parseFloat(salaryMin);
    const salMax = salaryMax === '' ? null : parseFloat(salaryMax);

    if (maxE !== null && minE !== null && maxE < minE) {
      nextErrors.experience = 'Maximum experience cannot be less than minimum experience.';
    }
    if (salMax !== null && salMin !== null && salMax < salMin) {
      nextErrors.salary = 'Maximum salary cannot be less than minimum salary.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.title) titleInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('jdFile', jdFileToSubmit);

      const response = await createJob(formData);
      const jobId = response.data?._id || response.data?.id;

      if (!jobId) {
        setFormError(response.message || 'The job could not be created.');
        return;
      }

      // Save criteria modifications
      try {
        await updateJobCriteria(jobId, {
          ...(requiredSkills.length ? { requiredSkills } : {}),
          ...(preferredSkills.length ? { preferredSkills } : {}),
          ...(searchKeywords.length ? { searchKeywords } : {}),
          ...(preferredLocations.length ? { preferredLocations } : {}),
          ...(qualifications.length ? { qualifications } : {}),
          ...(minE !== null ? { minimumExperience: minE } : {}),
          ...(maxE !== null ? { maximumExperience: maxE } : {}),
          ...(salMin !== null ? { salaryMin: salMin } : {}),
          ...(salMax !== null ? { salaryMax: salMax } : {})
        });
      } catch (criteriaErr) {
        toast.error(`Job created, but criteria could not be saved: ${toApiError(criteriaErr).message}`);
        navigate(`/jobs/${jobId}`);
        return;
      }

      toast.success(`Job "${response.data.title}" created successfully.`);
      navigate(`/jobs/${jobId}`);
    } catch (err) {
      setFormError(toApiError(err).message || 'Job could not be created. Please review the highlighted fields.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[820px] mx-auto py-8 px-4 sm:px-6">
      {/* ------------------------------------------------ Header */}
      <div className="mb-6">
        <Link
          to="/jobs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors mb-2.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Jobs
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create Job</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload the job description and confirm the key requirements.
        </p>
      </div>

      {/* Global Error Banner */}
      {formError && (
        <div className="mb-6">
          <InlineAlert tone="error" title="Could not create job" message={formError} />
        </div>
      )}

      {/* ------------------------------------------------ Main Form Surface */}
      <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8 space-y-7">
        
        {/* ============================================== 1. JOB DESCRIPTION */}
        <section aria-labelledby="section-jd">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
            <div>
              <h2 id="section-jd" className="text-base font-semibold text-slate-900">
                Job Description <span className="text-rose-500" aria-hidden="true">*</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                The role title, required skills, and experience are extracted automatically.
              </p>
            </div>

            {/* Mode Switcher */}
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-medium text-slate-600">
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                disabled={submitting}
                className={cx(
                  'px-3 py-1 rounded-md transition-all',
                  inputMode === 'upload' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'hover:text-slate-900'
                )}
              >
                Upload JD
              </button>
              <button
                type="button"
                onClick={() => setInputMode('paste')}
                disabled={submitting}
                className={cx(
                  'px-3 py-1 rounded-md transition-all',
                  inputMode === 'paste' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'hover:text-slate-900'
                )}
              >
                Paste description
              </button>
            </div>
          </div>

          {/* Mode A: File Upload */}
          {inputMode === 'upload' && (
            <div>
              {!file ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!submitting) setDragActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (!submitting && e.dataTransfer?.files?.[0]) {
                      handleFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  className={cx(
                    'border-2 border-dashed rounded-xl px-6 py-6 text-center transition-colors',
                    dragActive ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 bg-slate-50/60',
                    errors.file ? 'border-rose-300 bg-rose-50/40' : 'hover:bg-slate-100/60 hover:border-slate-300'
                  )}
                >
                  <input
                    ref={fileInputRef}
                    id="jdFileInput"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    disabled={submitting}
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    className="sr-only"
                    aria-describedby={errors.file ? 'jdFile-error' : 'jdFile-hint'}
                  />
                  <div className="flex flex-col items-center justify-center">
                    <span className="w-10 h-10 rounded-full bg-white border border-slate-200/90 shadow-sm flex items-center justify-center text-brand-600 mb-2.5">
                      <UploadCloud className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-semibold text-slate-800">Upload job description</p>
                    <p id="jdFile-hint" className="text-xs text-slate-500 mt-0.5">
                      PDF, DOCX or TXT · up to 5 MB
                    </p>
                    <label
                      htmlFor="jdFileInput"
                      className="mt-3 inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors"
                    >
                      Choose file
                    </label>
                  </div>
                </div>
              ) : (
                /* Compact File Selected State */
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{file.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatFileSize(file.size)} · Uploaded successfully
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label
                      htmlFor="jdFileInput"
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer px-2.5 py-1 rounded-md hover:bg-slate-200/60 transition-colors"
                    >
                      Replace
                    </label>
                    <button
                      type="button"
                      onClick={handleClearFile}
                      disabled={submitting}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-md hover:bg-rose-50 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode B: Paste Text */}
          {inputMode === 'paste' && (
            <div className="space-y-2">
              <label htmlFor="pastedJdText" className="sr-only">
                Paste job description
              </label>
              <textarea
                id="pastedJdText"
                rows={5}
                value={pastedText}
                onChange={(e) => {
                  setPastedText(e.target.value);
                  if (errors.file) setErrors((p) => ({ ...p, file: undefined }));
                }}
                disabled={submitting}
                placeholder="Paste the complete job description text here..."
                className={cx('input py-2.5 font-normal resize-y', errors.file && 'input-error')}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">
                  {pastedText.length > 0 ? `${pastedText.length.toLocaleString('en-IN')} characters` : 'Paste text to auto-populate fields'}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePasteExtract}
                  loading={isReadingJd}
                  disabled={!pastedText.trim() || submitting}
                >
                  Read Details
                </Button>
              </div>
            </div>
          )}

          {/* Reading State Feedback */}
          {isReadingJd && (
            <div className="mt-3 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-brand-50/70 border border-brand-100 text-brand-900 text-xs font-medium animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600 shrink-0" aria-hidden="true" />
              <span>Reading job description...</span>
            </div>
          )}

          {/* Post-Extraction Notification */}
          {!isReadingJd && extractionStatus === 'complete' && (
            <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200/80 px-3.5 py-2.5 flex items-start gap-2.5 animate-scale-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-emerald-950">Job details extracted</p>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Review the information below.
                </p>
              </div>
            </div>
          )}

          {!isReadingJd && extractionStatus === 'partial' && (
            <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 flex items-start gap-2.5 animate-scale-in">
              <Info className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-slate-900">Most job details were extracted</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Review the highlighted fields and add anything missing.
                </p>
              </div>
            </div>
          )}

          {!isReadingJd && extractionStatus === 'failed' && (
            <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 flex items-start gap-2.5 animate-scale-in">
              <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-slate-800">We couldn't read enough information from this file.</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  You can still complete the job details manually.
                </p>
              </div>
            </div>
          )}

          {errors.file && (
            <p id="jdFile-error" className="text-xs text-rose-600 mt-1.5 font-medium">
              {errors.file}
            </p>
          )}

          {/* JD Content Inspector (Collapsed by Default) */}
          {(file || pastedText) && extractedText && (
            <div className="mt-3 pt-2">
              <button
                type="button"
                onClick={() => setShowJdEditor((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-brand-700 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <span>Job description text</span>
                <span className="text-slate-400">·</span>
                <span className="text-brand-600 hover:underline">
                  {showJdEditor ? 'Hide text' : 'View / Edit description'}
                </span>
                {showJdEditor ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
              </button>

              {showJdEditor && (
                <div className="mt-2.5 space-y-1.5 animate-scale-in">
                  <textarea
                    rows={6}
                    value={extractedText}
                    onChange={(e) => setExtractedText(e.target.value)}
                    disabled={submitting}
                    className="input text-xs font-mono leading-relaxed resize-y"
                    placeholder="Parsed job description text..."
                  />
                  <p className="text-[11px] text-slate-400">
                    This text is indexed for candidate keyword matching and screening.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Divider */}
        <hr className="border-slate-100" />

        {/* ============================================== 2. BASIC DETAILS */}
        <section aria-labelledby="section-basic" className="space-y-4">
          <div>
            <h2 id="section-basic" className="text-base font-semibold text-slate-900">
              Basic Details
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              The role title candidates are applying for.
            </p>
          </div>

          {/* Job Title */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="jobTitleInput" className="field-label text-slate-900 mb-0">
                Job Title <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              {extractionStatus === 'partial' && missingFields.includes('title') && (
                <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                  Please confirm
                </span>
              )}
            </div>
            <input
              ref={titleInputRef}
              id="jobTitleInput"
              type="text"
              className={cx('input h-10 font-medium', errors.title && 'input-error')}
              placeholder="e.g. Senior React Developer"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((p) => ({ ...p, title: undefined }));
              }}
              disabled={submitting}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'title-error' : undefined}
            />
            {errors.title && (
              <p id="title-error" className="text-xs text-rose-600 mt-1 font-medium">
                {errors.title}
              </p>
            )}
          </div>
        </section>

        {/* Divider */}
        <hr className="border-slate-100" />

        {/* ============================================== 3. WHAT ARE YOU LOOKING FOR? */}
        <section aria-labelledby="section-looking-for" className="space-y-5">
          <div>
            <h2 id="section-looking-for" className="text-base font-semibold text-slate-900">
              What are you looking for?
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Add the main skills and qualifications you want candidates to have.
            </p>
          </div>

          {/* Must-have skills */}
          <div>
            <TokenInput
              id="requiredSkillsInput"
              label="Must-have skills"
              description="Skills candidates should ideally have for this role."
              values={requiredSkills}
              onChange={setRequiredSkills}
              suggestions={SKILL_SUGGESTIONS}
              placeholder="Add a skill, e.g. React"
              disabled={submitting}
            />
          </div>

          {/* Nice-to-have skills */}
          <div>
            <TokenInput
              id="preferredSkillsInput"
              label="Nice-to-have skills"
              description="Helpful skills, but not essential."
              values={preferredSkills}
              onChange={setPreferredSkills}
              suggestions={SKILL_SUGGESTIONS}
              placeholder="Add a skill, e.g. Docker"
              disabled={submitting}
            />
          </div>

          {/* Education */}
          <div>
            <TokenInput
              id="qualificationsInput"
              label="Education"
              badge="Optional"
              description={
                extractionStatus === 'partial' && missingFields.includes('education')
                  ? 'Optional · Not found in the JD. Add any qualification requirement if needed.'
                  : 'Add any qualification requirement, if needed.'
              }
              values={qualifications}
              onChange={setQualifications}
              suggestions={QUALIFICATION_SUGGESTIONS}
              placeholder="Add qualification, e.g. B.Tech or Computer Science degree"
              disabled={submitting}
            />
          </div>
        </section>

        {/* ============================================== 4. ADDITIONAL PREFERENCES (PROGRESSIVE DISCLOSURE) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowPreferences((prev) => !prev)}
            className="w-full flex items-center justify-between text-left p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-100/70 transition-colors"
            aria-expanded={showPreferences}
          >
            <div>
              <p className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                Additional preferences
                {hasPreferencesConfigured && (
                  <span className="text-[10px] font-medium bg-brand-50 text-brand-700 border border-brand-200/60 px-1.5 py-0.5 rounded-full">
                    Configured
                  </span>
                )}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Optional details for more precise matching.
              </p>
            </div>
            <div className="text-slate-400">
              {showPreferences ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showPreferences && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-4 animate-scale-in">
              {/* Experience Range */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-800 block">
                    Minimum experience
                  </span>
                  {extractionStatus === 'partial' && missingFields.includes('experience') && (
                    <span className="text-[11px] font-medium text-slate-500">
                      Please confirm
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-2">
                  Expected years of industry experience.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="minExpInput" className="text-[11px] font-medium text-slate-500 block mb-1">
                      Minimum (years)
                    </label>
                    <input
                      id="minExpInput"
                      type="number"
                      min="0"
                      step="0.5"
                      className="input h-9 text-sm"
                      placeholder="e.g. 3"
                      value={minExp}
                      onChange={(e) => {
                        setMinExp(e.target.value);
                        if (errors.experience) setErrors((p) => ({ ...p, experience: undefined }));
                      }}
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <label htmlFor="maxExpInput" className="text-[11px] font-medium text-slate-500 block mb-1">
                      Maximum (optional)
                    </label>
                    <input
                      id="maxExpInput"
                      type="number"
                      min="0"
                      step="0.5"
                      className="input h-9 text-sm"
                      placeholder="No limit"
                      value={maxExp}
                      onChange={(e) => {
                        setMaxExp(e.target.value);
                        if (errors.experience) setErrors((p) => ({ ...p, experience: undefined }));
                      }}
                      disabled={submitting}
                    />
                  </div>
                </div>
                {errors.experience && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{errors.experience}</p>
                )}
              </div>

              {/* Location Preference */}
              <div>
                <TokenInput
                  id="jobLocations"
                  label="Location preference"
                  description="Preferred office or remote work locations."
                  values={preferredLocations}
                  onChange={setPreferredLocations}
                  suggestions={LOCATION_SUGGESTIONS}
                  placeholder="Add location, e.g. Bengaluru, Remote"
                  disabled={submitting}
                />
              </div>

              {/* Annual Salary Band */}
              <div>
                <label className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 mb-1">
                  <IndianRupee className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  Annual salary band (₹)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-0.5">
                  <div>
                    <label htmlFor="salMinInput" className="text-[11px] font-medium text-slate-500 block mb-1">
                      Minimum (₹)
                    </label>
                    <input
                      id="salMinInput"
                      type="number"
                      min="0"
                      step="50000"
                      className="input h-9 text-sm"
                      placeholder="e.g. 600000"
                      value={salaryMin}
                      onChange={(e) => {
                        setSalaryMin(e.target.value);
                        if (errors.salary) setErrors((p) => ({ ...p, salary: undefined }));
                      }}
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <label htmlFor="salMaxInput" className="text-[11px] font-medium text-slate-500 block mb-1">
                      Maximum (₹)
                    </label>
                    <input
                      id="salMaxInput"
                      type="number"
                      min="0"
                      step="50000"
                      className="input h-9 text-sm"
                      placeholder="e.g. 1200000"
                      value={salaryMax}
                      onChange={(e) => {
                        setSalaryMax(e.target.value);
                        if (errors.salary) setErrors((p) => ({ ...p, salary: undefined }));
                      }}
                      disabled={submitting}
                    />
                  </div>
                </div>
                {errors.salary && <p className="text-xs text-rose-600 mt-1 font-medium">{errors.salary}</p>}
              </div>

              {/* Other criteria / Domain keywords */}
              <div>
                <TokenInput
                  id="searchKeywordsInput"
                  label="Other criteria"
                  description="Domain or industry keywords searched across candidate resumes."
                  values={searchKeywords}
                  onChange={setSearchKeywords}
                  placeholder="Add criteria, e.g. Fintech, EV, HIPAA"
                  disabled={submitting}
                />
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <hr className="border-slate-100" />

        {/* ============================================== 5. ACTIONS & SUBMIT */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <p className="text-xs text-slate-500">
            All details can be adjusted anytime from the job details page.
          </p>
          <div className="flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => navigate('/jobs')}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              icon={Sparkles}
              loading={submitting}
            >
              {submitting ? 'Creating job...' : 'Create Job'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CreateJob;
