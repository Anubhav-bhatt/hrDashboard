import React from 'react';
import JobsList from './JobsList';

/**
 * Closed jobs — the hiring history.
 *
 * Deliberately the jobs portal with its lifecycle filter fixed to CLOSED rather
 * than a second listing implementation: search, sort, pagination and the card
 * layout stay identical to the portal, and there is one place to change them.
 * Fixing the status here also means an active job cannot be surfaced on this
 * route by editing the query string.
 */
const ClosedJobs = () => <JobsList lockedStatus="CLOSED" title="Closed jobs" eyebrow="History" />;

export default ClosedJobs;
