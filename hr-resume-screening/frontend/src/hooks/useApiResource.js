import { useCallback, useEffect, useRef, useState } from 'react';
import { toApiError } from '../services/api';

/**
 * Fetches an API resource with cancellation, so a superseded request can never
 * overwrite fresher data and no state is set after unmount.
 *
 * @param {Function} fetcher Receives an axios config ({ signal }) and returns the response body
 * @param {Array} deps Re-fetch when these change
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true] Skip fetching while false
 * @param {boolean} [options.keepPreviousData=false] Retain the last result while refetching
 * @returns {{data, error, loading, refetching, refetch}}
 */
export const useApiResource = (fetcher, deps = [], options = {}) => {
  const { enabled = true, keepPreviousData = false } = options;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [refetching, setRefetching] = useState(false);

  const controllerRef = useRef(null);
  const mountedRef = useRef(true);
  const hasDataRef = useRef(false);

  // The fetcher is usually an inline arrow function, so it is held in a ref to
  // keep it out of the effect's dependency list.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const showSpinner = !keepPreviousData || !hasDataRef.current;
    if (showSpinner) setLoading(true);
    else setRefetching(true);
    setError(null);

    try {
      const result = await fetcherRef.current({ signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) return;
      setData(result);
      hasDataRef.current = true;
    } catch (err) {
      const apiError = toApiError(err);
      // A canceled request was replaced on purpose — not an error to display.
      if (apiError.canceled || !mountedRef.current) return;
      setError(apiError);
      if (!keepPreviousData) setData(null);
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setLoading(false);
        setRefetching(false);
      }
    }
  }, [keepPreviousData]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  return { data, error, loading, refetching, refetch: run, setData };
};

export default useApiResource;
