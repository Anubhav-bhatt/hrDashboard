import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, Plus } from 'lucide-react';
import JobSummaryCard from '../jobs/JobSummaryCard';
import { CardHeader, EmptyState, Skeleton } from '../ui';

/**
 * Jobs overview for the dashboard.
 *
 * Shows only the busiest handful of jobs with a link to the full portal, so the
 * dashboard stays readable when a workspace has dozens of open roles.
 */
const JobsOverviewSection = ({ jobs = [], total = 0, loading = false, strongMatchThreshold = 80 }) => (
  <section aria-label="Jobs overview">
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <CardHeader
        title="Jobs overview"
        description={
          total > jobs.length
            ? `Busiest ${jobs.length} of ${total} roles. Each card opens that role's candidates.`
            : 'Each card opens that role’s candidates.'
        }
      />
      <Link to="/jobs" className="btn btn-sm btn-secondary shrink-0">
        View all jobs
        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </Link>
    </div>

    {loading ? (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card card-pad-sm space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }, (_, j) => (
                <Skeleton key={j} className="h-12 rounded-control" />
              ))}
            </div>
          </div>
        ))}
      </div>
    ) : jobs.length === 0 ? (
      <EmptyState
        icon={Briefcase}
        title="No jobs yet"
        description="Create your first job and upload a JD to begin candidate screening."
        action={
          <Link to="/jobs/new" className="btn btn-sm btn-primary">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Create job
          </Link>
        }
      />
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {jobs.map((job) => (
          <JobSummaryCard key={job.id} job={job} strongMatchThreshold={strongMatchThreshold} compact />
        ))}
      </div>
    )}
  </section>
);

export default JobsOverviewSection;
