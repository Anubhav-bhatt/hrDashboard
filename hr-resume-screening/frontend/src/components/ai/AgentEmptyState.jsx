import React from 'react';
import { Sparkles } from 'lucide-react';
import { EmptyState } from '../ui';

/**
 * The resting state of an agent workspace.
 *
 * Every agent page spends most of its life here, so it is written as guidance
 * rather than as an absence: "Select a job and rank its candidates to see
 * results" tells a recruiter what to do next, where "No data" would leave them
 * to work it out. The `title` should name the situation and `description` should
 * name the next action.
 *
 * Wraps the application's existing EmptyState so the AI pages match the empty
 * candidate list and empty job list a recruiter already knows.
 */
const AgentEmptyState = ({ icon = Sparkles, title, description, action, className }) => (
  <EmptyState icon={icon} title={title} description={description} action={action} className={className} />
);

export default AgentEmptyState;
