import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Sparkles, UploadCloud, X } from 'lucide-react';
import { createJob, toApiError } from '../services/api';
import { useToast } from '../components/ToastProvider';
import { Button, Card, InlineAlert, PageHeader, cx } from '../components/ui';
import { formatFileSize } from '../utils/format';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Job creation. The uploaded job description is parsed server-side into
 * structured requirements, which then drive candidate scoring.
 */
const CreateJob = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const inputRef = useRef(null);

  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const validateFile = (selected) => {
    if (!selected) return;
    setFormError('');

    const ext = `.${selected.name.split('.').pop().toLowerCase()}`;
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setErrors((prev) => ({ ...prev, file: 'Unsupported file type. Upload a PDF, DOCX or TXT file.' }));
      return;
    }
    if (selected.size > MAX_SIZE_BYTES) {
      setErrors((prev) => ({ ...prev, file: 'File is larger than 5 MB. Please choose a smaller file.' }));
      return;
    }

    setErrors((prev) => ({ ...prev, file: undefined }));
    setFile(selected);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) validateFile(dropped);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    const nextErrors = {};
    if (!title.trim()) nextErrors.title = 'Enter the job title candidates are applying for.';
    if (!file) nextErrors.file = 'Attach the job description document.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('jdFile', file);

      const response = await createJob(formData);
      const jobId = response.data?._id || response.data?.id;

      if (jobId) {
        toast.success(`"${response.data.title}" created. Requirements extracted from the job description.`);
        navigate(`/jobs/${jobId}`);
      } else {
        setFormError(response.message || 'The job could not be created.');
      }
    } catch (error) {
      setFormError(toApiError(error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader
        backTo="/jobs"
        backLabel="Jobs"
        eyebrow="New role"
        title="Create a recruitment job"
        description="Upload the job description. Its requirements are extracted automatically and used to score every candidate you import."
      />

      {formError && <InlineAlert tone="error" title="Could not create job" message={formError} />}

      <Card padding="card-pad-lg">
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div>
            <label htmlFor="jobTitle" className="field-label">
              Job title <span className="text-rose-500" aria-hidden="true">*</span>
            </label>
            <input
              id="jobTitle"
              type="text"
              className={cx('input', errors.title && 'input-error')}
              placeholder="e.g. Senior React Developer"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((p) => ({ ...p, title: undefined }));
              }}
              disabled={submitting}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'title-error' : 'title-hint'}
            />
            {errors.title ? (
              <p id="title-error" className="text-xs text-rose-600 mt-1.5 font-medium">
                {errors.title}
              </p>
            ) : (
              <p id="title-hint" className="text-xs text-slate-500 mt-1.5">
                Used for role-relevance scoring, so match it to the advertised title.
              </p>
            )}
          </div>

          <div>
            <span className="field-label">
              Job description file <span className="text-rose-500" aria-hidden="true">*</span>
            </span>

            {!file ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                }}
                onDrop={handleDrop}
                className={cx(
                  'border-2 border-dashed rounded-card p-8 text-center transition-colors duration-fast',
                  dragActive ? 'border-brand-500 bg-brand-50/60' : 'border-slate-300 bg-slate-50/60 hover:bg-slate-100/60',
                  errors.file && 'border-rose-300 bg-rose-50/40'
                )}
              >
                <input
                  ref={inputRef}
                  id="fileUpload"
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => validateFile(e.target.files?.[0])}
                  className="sr-only"
                  aria-describedby={errors.file ? 'file-error' : 'file-hint'}
                />
                <label htmlFor="fileUpload" className="cursor-pointer block">
                  <span className="mx-auto w-11 h-11 bg-white rounded-pill border border-slate-200 flex items-center justify-center shadow-card mb-3">
                    <UploadCloud className="w-5 h-5 text-brand-600" aria-hidden="true" />
                  </span>
                  <span className="text-card-title text-slate-900 block">Click to upload, or drag the file here</span>
                  <span id="file-hint" className="text-xs text-slate-500 mt-1 block">
                    PDF, DOCX or TXT · up to 5 MB · processed in memory, never written to disk
                  </span>
                </label>
              </div>
            ) : (
              <div className="rounded-card border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-control bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-meta font-semibold text-slate-900 truncate">{file.name}</p>
                    <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="iconSm"
                  icon={X}
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                  disabled={submitting}
                  aria-label="Remove selected file"
                />
              </div>
            )}

            {errors.file && (
              <p id="file-error" className="text-xs text-rose-600 mt-1.5 font-medium">
                {errors.file}
              </p>
            )}
          </div>

          <div className="pt-5 divider flex items-center justify-end gap-2">
            <Button variant="ghost" size="md" onClick={() => navigate('/jobs')} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" icon={Sparkles} loading={submitting}>
              {submitting ? 'Extracting requirements…' : 'Create job'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default CreateJob;
