import { useEffect, useState } from 'react';

/**
 * Whether the user has asked the operating system to reduce motion.
 *
 * The stylesheet already collapses animation *durations* globally, which is
 * enough for a fade. It is not enough for anything built on a delay: a staggered
 * reveal whose duration is zeroed but whose `animation-delay` is not leaves an
 * element invisible for the length of the stagger, and a connector drawn with
 * `stroke-dashoffset` finishes instantly at the wrong value. Those cases need to
 * be decided in JavaScript — hence this hook.
 *
 * Stays live: a preference changed while the app is open is honoured without a
 * reload.
 */
export const usePrefersReducedMotion = () => {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event) => setPrefersReduced(event.matches);

    // addEventListener is unavailable on MediaQueryList in older Safari.
    if (query.addEventListener) query.addEventListener('change', onChange);
    else query.addListener(onChange);

    return () => {
      if (query.removeEventListener) query.removeEventListener('change', onChange);
      else query.removeListener(onChange);
    };
  }, []);

  return prefersReduced;
};

export default usePrefersReducedMotion;
