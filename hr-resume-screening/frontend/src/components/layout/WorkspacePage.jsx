import React from 'react';
import { useWorkspaceMode } from '../../context/WorkspaceModeContext';
import { cx } from '../ui';

/**
 * Top-level page container ensuring consistent max-width, gutters, and spacing
 * across both Standard Mode and Minimalist Mode.
 *
 * Implements Step 18 of the Spacing & Width Architecture:
 * - Desktop max-width: max-w-7xl
 * - Consistent section rhythm (space-y-6 in standard, space-y-5 in minimal)
 * - Mobile gutters: px-4 sm:px-6 lg:px-8
 * - Eliminates viewport edge collisions and uneven horizontal gutters.
 */
const WorkspacePage = ({ children, className = '', fluid = false }) => {
  const { isMinimal } = useWorkspaceMode();

  return (
    <div
      className={cx(
        'w-full pb-12',
        !fluid && 'max-w-7xl mx-auto',
        isMinimal ? 'space-y-5' : 'space-y-6',
        className
      )}
    >
      {children}
    </div>
  );
};

export default WorkspacePage;
