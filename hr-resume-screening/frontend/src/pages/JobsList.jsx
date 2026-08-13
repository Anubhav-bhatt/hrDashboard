import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Plus, Search, X } from 'lucide-react';
import { getJobs } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import JobCard from '../components/JobCard';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '../components/ui';

const JobCardSkeleton = () => (
  <div className="card card-pad space-y-4">
    <div className="flex items-start justify-between gap-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-5 w-20 rounded-pill" />
    </div>
    <Skeleton className="h-3 w-52" />
    <div className="grid grid-cols-3 gap-2">
      <Skeleton className="h-14 rounded-control" />
      <Skeleton className="h-14 rounded-control" />
      <Skeleton className="h-14 rounded-control" />
    </div>
    <Skeleton className="h-9 w-full rounded-control" />
  </div>
);

/**
 * Job listing. Search filters client-side because the job count per workspace is
 * small; candidates are the collection that needs server-side paging.
 */
const JobsList = () => {
  const [search, setSearch] = useState('');
  const { data, error, loading, refetch } = useApiResource((config) => getJobs(config), []);

  const jobs = data?.data || [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return jobs;
    return jobs.filter(
      (job) =>
        job.title?.toLowerCase().includes(term) ||
        job.jdFileName?.toLowerCase().includes(term) ||
        (job.requirements?.requiredSkills || []).some((skill) => skill.toLowerCase().includes(term))
    );
  }, [jobs, search]);

  const totalCandidates = jobs.reduce((sum, job) => sum + (job.candidatesCount || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-label uppercase text-brand-700">Open roles</p>
          <h1 className="text-page-title sm:text-display mt-1.5">Jobs</h1>
          <p className="text-meta text-slate-500 mt-1.5">
            {loading
              ? 'Loading roles…'
              : `${jobs.length} role${jobs.length === 1 ? '' : 's'} · ${totalCandidates} candidate${totalCandidates === 1 ? '' : 's'} screened.`}
          </p>
        </div>

        <Link to="/jobs/new" className="btn btn-md btn-primary">
          <Plus className="w-4 h-4" aria-hidden="true" />
          Create job
        </Link>
      </div>

      {jobs.length > 0 && (
        <Card padding="card-pad-sm">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" aria-hidden="true" />
            <label htmlFor="job-search" className="sr-only">
              Search jobs by title, JD file or required skill
            </label>
            <input
              id="job-search"
              type="search"
              className="input pl-9 pr-9"
              placeholder="Search by job title, JD file or required skill…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors duration-fast"
                aria-label="Clear job search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </Card>
      )}

      {error ? (
        <ErrorState title="Unable to load jobs" error={error} onRetry={refetch} />
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }, (_, i) => (
            <JobCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={search ? 'No jobs match your search' : 'No jobs created yet'}
          description={
            search
              ? 'Try a different job title, JD file name or skill.'
              : 'Create a recruitment job and upload its job description to start screening candidates.'
          }
          action={
            search ? (
              <Button variant="primary" size="sm" onClick={() => setSearch('')}>
                Clear search
              </Button>
            ) : (
              <Link to="/jobs/new" className="btn btn-sm btn-primary">
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Create your first job
              </Link>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((job) => (
            <JobCard key={job._id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
};

export default JobsList;
