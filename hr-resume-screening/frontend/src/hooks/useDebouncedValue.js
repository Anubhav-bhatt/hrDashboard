import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delay` ms.
 *
 * Used by search inputs so a request is issued once the recruiter stops typing
 * rather than on every keystroke.
 */
export const useDebouncedValue = (value, delay = 350) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};

export default useDebouncedValue;
