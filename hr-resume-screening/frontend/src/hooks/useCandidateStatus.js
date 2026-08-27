import { useCallback, useState } from 'react';
import { toApiError, updateCandidateStatus } from '../services/api';
import { useToast } from '../components/ToastProvider';
import { HR_STATUS_META } from '../utils/format';

/**
 * The single candidate status mutation.
 *
 * Shortlisting a candidate is reachable from the card grid, the candidate table,
 * the quick-look panel and the minimalist workspace. This hook exists so those
 * four entry points share one request, one optimistic-update signal, one toast
 * and one error convention — a second copy would be where they drift, and the
 * copy that drifted would be the one that stopped telling the recruiter a write
 * had failed.
 *
 * The caller owns the data it rendered from, so `onUpdated` reports the change
 * rather than this hook reaching into anyone's list. That keeps the hook usable
 * by a surface holding a paginated response, a single candidate, or nothing at
 * all beyond the row it just changed.
 *
 * @param {Object} [options]
 * @param {Function} [options.onUpdated] (candidateId, status, candidate) after a successful write
 * @returns {{updatingId: string|null, errors: Object, changeStatus: Function, clearError: Function}}
 */
export const useCandidateStatus = ({ onUpdated } = {}) => {
  const toast = useToast();
  const [updatingId, setUpdatingId] = useState(null);
  const [errors, setErrors] = useState({});

  const clearError = useCallback((candidateId) => {
    setErrors((current) => ({ ...current, [candidateId]: null }));
  }, []);

  const changeStatus = useCallback(
    async (candidate, status) => {
      // A no-op write still costs a request and would flash a toast saying
      // something changed when nothing did.
      if (!candidate || status === candidate.hrStatus || updatingId) return false;

      setUpdatingId(candidate._id);
      setErrors((current) => ({ ...current, [candidate._id]: null }));

      try {
        await updateCandidateStatus(candidate.jobId, candidate._id, status);
        onUpdated?.(candidate._id, status, candidate);
        toast.success(
          status === 'SHORTLISTED'
            ? 'Candidate shortlisted'
            : `${candidate.name} marked as ${HR_STATUS_META[status]?.label || status}.`
        );
        return true;
      } catch (err) {
        const apiError = toApiError(err);
        // Shortlisting is the one status a recruiter fires from a dense row and
        // may not see a toast for, so it also leaves an inline retry behind.
        if (status === 'SHORTLISTED') {
          setErrors((current) => ({ ...current, [candidate._id]: apiError.message }));
        }
        toast.error(apiError.message);
        return false;
      } finally {
        setUpdatingId(null);
      }
    },
    [onUpdated, toast, updatingId]
  );

  return { updatingId, errors, changeStatus, clearError };
};

export default useCandidateStatus;
