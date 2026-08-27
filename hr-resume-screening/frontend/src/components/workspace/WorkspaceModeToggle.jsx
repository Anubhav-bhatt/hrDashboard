import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Focus, Minimize2 } from 'lucide-react';
import { FOCUS_ROUTE, useWorkspaceMode } from '../../context/WorkspaceModeContext';
import { cx } from '../ui';

/**
 * Enters and leaves the minimalist workspace.
 *
 * Sits beside the appearance control because that is where a user looks for
 * "how this application presents itself" — but it is a separate control writing
 * separate state, so choosing dark does not imply focus and leaving focus does
 * not restore light.
 *
 * Entering remembers where the recruiter was; leaving takes them back there
 * rather than to a default page, which is the difference between a mode and a
 * navigation they have to undo by hand.
 */
const WorkspaceModeToggle = ({ className, withLabel = false }) => {
  const { isMinimal, enterMinimal, exitMinimal } = useWorkspaceMode();
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = () => {
    if (isMinimal) {
      const target = exitMinimal();
      navigate(target || '/');
      return;
    }

    enterMinimal(`${location.pathname}${location.search}`);
    navigate(FOCUS_ROUTE);
  };

  const Icon = isMinimal ? Minimize2 : Focus;
  const label = isMinimal ? 'Exit minimal mode' : 'Minimal mode';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isMinimal}
      className={cx(
        withLabel ? 'btn btn-sm btn-secondary' : 'btn btn-icon-sm btn-ghost',
        // Active state is carried by the tint AND by aria-pressed, never by
        // colour alone.
        isMinimal && !withLabel && 'bg-brand-50 text-brand-700 hover:bg-brand-100',
        className
      )}
      title={isMinimal ? 'Leave minimal mode and return to the full workspace' : 'Focus on jobs, best fits and AI tools'}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      {withLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </button>
  );
};

export default WorkspaceModeToggle;
