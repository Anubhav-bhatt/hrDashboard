import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { getJobsSummary } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import CandidateBrowser from '../components/candidate/CandidateBrowser';
import { PageHeader } from '../components/ui';

/**
 * Global candidate list — every applicant across every role.
 *
 * A job filter is offered here for convenience, but the canonical job-scoped
 * view is /jobs/:jobId/candidates, where the job comes from the route and
 * survives a refresh or a bookmark.
 */
const CandidatesList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState(null);

  const selectedJobId = searchParams.get('jobId') || '';

  // Job options come from the database, never a hard-coded list.
  const { data: jobsData } = useApiResource((config) => getJobsSummary({ sort: 'newest' }, config), []);
  const jobs = jobsData?.data || [];

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) || null, [jobs, selectedJobId]);

  const handleJobChange = (jobId) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (jobId) next.set('jobId', jobId);
        else next.delete('jobId');
        next.delete('page');
        return next;
      },
      { replace: true }
    );
  };

  const total = summary?.pagination?.total;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Talent pool"
        title="Candidates"
        description={
          total === undefined
            ? 'Search, filter and screen applicants across every role.'
            : selectedJob
              ? `${total} candidate${total === 1 ? '' : 's'} for ${selectedJob.title}.`
              : `${total} candidate${total === 1 ? '' : 's'} across every role.`
        }
        actions={
          <Link to="/jobs" className="btn btn-md btn-secondary">
            <Briefcase className="w-4 h-4" aria-hidden="true" />
            Browse by job
          </Link>
        }
      />

      <CandidateBrowser
        defaultSort="score_desc"
        onLoaded={setSummary}
        extraFilters={
          <div>
            <label htmlFor="filter-job" className="field-label">
              Job
            </label>
            <select
              id="filter-job"
              className="select"
              value={selectedJobId}
              onChange={(e) => handleJobChange(e.target.value)}
            >
              <option value="">All jobs</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} ({job.candidateCount})
                </option>
              ))}
            </select>
          </div>
        }
      />
    </div>
  );
};

export default CandidatesList;
