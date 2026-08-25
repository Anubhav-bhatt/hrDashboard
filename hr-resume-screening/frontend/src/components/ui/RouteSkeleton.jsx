import React from 'react';
import { Skeleton, cx } from './index';

/** Content-shaped fallback used while a lazy route chunk or its context loads. */
const RouteSkeleton = ({ variant = 'workspace', label = 'Loading workspace...', className }) => (
  <div className={cx('space-y-6', className)} role="status" aria-label={label} aria-busy="true">
    <div className="space-y-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-64 max-w-[80vw]" />
      <Skeleton className="h-3 w-full max-w-xl" />
    </div>

    {variant === 'upload' ? (
      <div className="card card-pad-lg space-y-6">
        <div className="flex gap-3 border-b border-slate-100 pb-3">
          <Skeleton className="h-8 w-32 rounded-control" />
          <Skeleton className="h-8 w-32 rounded-control" />
        </div>
        <div className="rounded-card border border-slate-200 p-6 sm:p-10">
          <Skeleton className="mx-auto h-10 w-10 rounded-pill" />
          <Skeleton className="mx-auto mt-4 h-4 w-44" />
          <Skeleton className="mx-auto mt-2 h-3 w-56" />
          <Skeleton className="mx-auto mt-5 h-10 w-36 rounded-control" />
        </div>
      </div>
    ) : variant === 'ai' ? (
      <>
        <div className="card card-pad grid gap-4 md:grid-cols-2">
          <Skeleton className="h-10 w-full rounded-control" />
          <Skeleton className="h-10 w-full rounded-control" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="card card-pad space-y-3">
              <Skeleton className="h-8 w-8 rounded-control" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      </>
    ) : (
      <>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="card card-pad space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="card card-pad-lg space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-32 w-full rounded-control" />
        </div>
      </>
    )}

    <span className="sr-only">{label}</span>
  </div>
);

export default RouteSkeleton;
