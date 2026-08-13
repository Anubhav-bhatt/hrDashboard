import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, FileText, GraduationCap, IndianRupee, MapPin, Search, Sparkles } from 'lucide-react';
import { createJob, updateJobCriteria, toApiError } from '../services/api';
import { useToast } from '../components/ToastProvider';
import { Button, InlineAlert, PageHeader } from '../components/ui';
import FormSection from '../components/ui/FormSection';
import FileDropZone from '../components/ui/FileDropZone';
import TokenInput from '../components/ui/TokenInput';

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

const QUALIFICATION_SUGGESTIONS = ['B.Tech', 'B.E.', 'M.Tech', 'BCA', 'MCA', 'B.Sc', 'MBA', 'Diploma', 'Any Graduate'];

/**
 * Job creation.
 *
 * One route, three numbered sections: identify the role, upload its description,
 * then describe the ideal candidate. The job is created from the first two
 * sections; any criteria supplied in section three are saved immediately
 * afterwards, so the recruiter reaches a fully configured job in one pass
 * instead of creating a job and then editing it.
 */
const CreateJob = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  // Section 3 — every field optional; the JD parser fills gaps on creation.
  const [requiredSkills, setRequiredSkills] = useState([]);
  const [preferredSkills, setPreferredSkills] = useState([]);
  const [searchKeywords, setSearchKeywords] = useState([]);
  const [preferredLocations, setPreferredLocations] = useState([]);
  const [qualifications, setQualifications] = useState([]);
  const [minExp, setMinExp] = useState('');
  const [maxExp, setMaxExp] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');

  const titleRef = useRef(null);

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

  const hasCriteria =
    requiredSkills.length ||
    preferredSkills.length ||
    searchKeywords.length ||
    preferredLocations.length ||
    qualifications.length ||
    minExp !== '' ||
    maxExp !== '' ||
    salaryMin !== '' ||
    salaryMax !== '';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    const nextErrors = {};
    if (!title.trim()) nextErrors.title = 'Enter the job title candidates are applying for.';
    if (!file) nextErrors.file = 'Attach the job description document.';

    // Numeric ranges are checked before anything is created.
    const minE = minExp === '' ? null : parseFloat(minExp);
    const maxE = maxExp === '' ? null : parseFloat(maxExp);
    const salMin = salaryMin === '' ? null : parseFloat(salaryMin);
    const salMax = salaryMax === '' ? null : parseFloat(salaryMax);

    if (maxE !== null && minE !== null && maxE < minE) {
      nextErrors.experience = 'Maximum experience cannot be less than the minimum.';
    }
    if (salMax !== null && salMin !== null && salMax < salMin) {
      nextErrors.salary = 'Maximum salary cannot be less than the minimum.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.title) titleRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('jdFile', file);

      const response = await createJob(formData);
      const jobId = response.data?._id || response.data?.id;

      if (!jobId) {
        setFormError(response.message || 'The job could not be created.');
        return;
      }

      // Apply any criteria the recruiter set here, so they do not have to open
      // the job afterwards just to save them.
      if (hasCriteria) {
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
        } catch (criteriaError) {
          // The job exists; only the extra criteria failed. Say so plainly and
          // still take the recruiter to the job rather than losing their work.
          toast.error(`Job created, but the criteria could not be saved: ${toApiError(criteriaError).message}`);
          navigate(`/jobs/${jobId}`);
          return;
        }
      }

      toast.success(`"${response.data.title}" created. Requirements extracted from the job description.`);
      navigate(`/jobs/${jobId}`);
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
        title="Create job"
        description="Set up the role, upload the job description, and define what an ideal candidate looks like."
      />

      {formError && <InlineAlert tone="error" title="Could not create job" message={formError} />}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* ------------------------------------------------ 01 Job information */}
        <FormSection
          step="01"
          title="Job information"
          description="How this role appears across the dashboard."
        >
          <label htmlFor="jobTitle" className="field-label">
            Job title <span className="text-rose-500" aria-hidden="true">*</span>
          </label>
          <input
            ref={titleRef}
            id="jobTitle"
            type="text"
            className={`input ${errors.title ? 'input-error' : ''}`}
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
        </FormSection>

        {/* ----------------------------------------------- 02 Job description */}
        <FormSection
          step="02"
          title="Job description"
          description="Requirements are extracted from this document automatically."
        >
          <FileDropZone
            id="jdFile"
            accept=".pdf,.docx,.txt"
            title="Drag and drop the job description, or choose a file"
            hint="PDF, DOCX or TXT · up to 5 MB · processed in memory, never written to disk"
            files={file ? [file] : []}
            onFiles={(files) => validateFile(files[0])}
            onClear={() => {
              setFile(null);
              setErrors((p) => ({ ...p, file: undefined }));
            }}
            error={errors.file}
            disabled={submitting}
          />
        </FormSection>

        {/* --------------------------------------- 03 Candidate search criteria */}
        <FormSection
          step="03"
          title="Candidate search criteria"
          description="Leave anything blank and it will be taken from the job description instead."
          optional
        >
          <div className="space-y-6">
            <TokenInput
              id="required-skills"
              label="Required skills"
              description="Core skills, worth 40 of the 100 score points."
              values={requiredSkills}
              onChange={setRequiredSkills}
              suggestions={SKILL_SUGGESTIONS}
              placeholder="e.g. React"
              addLabel="Add skill"
              disabled={submitting}
            />

            <TokenInput
              id="preferred-skills"
              label="Preferred skills"
              description="Nice to have, worth 10 points."
              values={preferredSkills}
              onChange={setPreferredSkills}
              suggestions={SKILL_SUGGESTIONS}
              placeholder="e.g. Docker"
              addLabel="Add skill"
              disabled={submitting}
            />

            <TokenInput
              id="search-keywords"
              label="Domain keywords"
              description="Free-text terms searched across resume content."
              values={searchKeywords}
              onChange={setSearchKeywords}
              placeholder="e.g. OCPP, EV charging"
              addLabel="Add keyword"
              tone="keyword"
              disabled={submitting}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 divider">
              <TokenInput
                id="locations"
                label="Preferred locations"
                values={preferredLocations}
                onChange={setPreferredLocations}
                suggestions={LOCATION_SUGGESTIONS}
                placeholder="e.g. Gurugram"
                addLabel="Add location"
                disabled={submitting}
              />

              <TokenInput
                id="qualifications"
                label="Qualifications"
                values={qualifications}
                onChange={setQualifications}
                suggestions={QUALIFICATION_SUGGESTIONS}
                placeholder="e.g. B.Tech"
                addLabel="Add qualification"
                disabled={submitting}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 divider">
              <div>
                <p className="text-meta font-semibold text-slate-900 inline-flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  Experience
                </p>
                <div className="grid grid-cols-2 gap-3 mt-2.5">
                  <div>
                    <label htmlFor="min-exp" className="field-label">Minimum (years)</label>
                    <input
                      id="min-exp"
                      type="number"
                      min="0"
                      step="0.5"
                      className="input h-9"
                      placeholder="2"
                      value={minExp}
                      onChange={(e) => {
                        setMinExp(e.target.value);
                        setErrors((p) => ({ ...p, experience: undefined }));
                      }}
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <label htmlFor="max-exp" className="field-label">Maximum</label>
                    <input
                      id="max-exp"
                      type="number"
                      min="0"
                      step="0.5"
                      className="input h-9"
                      placeholder="No limit"
                      value={maxExp}
                      onChange={(e) => {
                        setMaxExp(e.target.value);
                        setErrors((p) => ({ ...p, experience: undefined }));
                      }}
                      disabled={submitting}
                    />
                  </div>
                </div>
                {errors.experience && (
                  <p className="text-xs text-rose-600 mt-1.5 font-medium">{errors.experience}</p>
                )}
              </div>

              <div>
                <p className="text-meta font-semibold text-slate-900 inline-flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  Annual salary band
                </p>
                <div className="grid grid-cols-2 gap-3 mt-2.5">
                  <div>
                    <label htmlFor="sal-min" className="field-label">Minimum (₹)</label>
                    <input
                      id="sal-min"
                      type="number"
                      min="0"
                      step="50000"
                      className="input h-9"
                      placeholder="600000"
                      value={salaryMin}
                      onChange={(e) => {
                        setSalaryMin(e.target.value);
                        setErrors((p) => ({ ...p, salary: undefined }));
                      }}
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <label htmlFor="sal-max" className="field-label">Maximum (₹)</label>
                    <input
                      id="sal-max"
                      type="number"
                      min="0"
                      step="50000"
                      className="input h-9"
                      placeholder="1200000"
                      value={salaryMax}
                      onChange={(e) => {
                        setSalaryMax(e.target.value);
                        setErrors((p) => ({ ...p, salary: undefined }));
                      }}
                      disabled={submitting}
                    />
                  </div>
                </div>
                {errors.salary && <p className="text-xs text-rose-600 mt-1.5 font-medium">{errors.salary}</p>}
              </div>
            </div>
          </div>
        </FormSection>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-slate-500">
            {hasCriteria
              ? 'Your criteria will be saved with the job.'
              : 'Requirements will be extracted from the job description.'}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="md" onClick={() => navigate('/jobs')} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" icon={Sparkles} loading={submitting}>
              {submitting ? 'Extracting requirements…' : 'Create job'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CreateJob;
