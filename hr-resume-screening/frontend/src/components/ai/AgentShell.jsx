import React from 'react';
import { cx } from '../ui';
import AgentHeader from './AgentHeader';
import AgentErrorBoundary from './AgentErrorBoundary';

/**
 * The frame every agent page renders inside.
 *
 * Header, then an optional setup panel, then the workspace, then the instruction
 * field. Fixing that order in one component is what makes the five modes feel
 * like one system: a recruiter learns the layout once, and moving from screening
 * to ranking changes the content of the middle band and nothing else.
 *
 * The whole page is wrapped in an AI-specific error boundary. A fault inside an
 * agent must degrade to a recoverable message inside this section rather than
 * taking down the application shell around it — the sidebar, the account menu and
 * every other screen stay usable, because AI is additive and a failure in it
 * should not read as the dashboard breaking.
 *
 * @param {Object} props
 * @param {Object} props.mode The agent mode definition
 * @param {React.ReactNode} [props.setup] Selectors and options for this agent
 * @param {React.ReactNode} props.children The workspace
 * @param {React.ReactNode} [props.input] Instruction field, usually an AgentInput
 * @param {React.ReactNode} [props.actions] Extra header actions
 */
const AgentShell = ({ mode, setup, children, input, actions, className }) => (
  <AgentErrorBoundary>
    <div className={cx('flex flex-col gap-5 min-w-0', className)}>
      <AgentHeader mode={mode} actions={actions} />

      {setup && <div className="min-w-0">{setup}</div>}

      <div className="min-w-0 flex-1">{children}</div>

      {input && <div className="min-w-0">{input}</div>}
    </div>
  </AgentErrorBoundary>
);

export default AgentShell;
