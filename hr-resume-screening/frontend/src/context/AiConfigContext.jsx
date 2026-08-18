import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAiConfig } from '../services/aiService';
import { useAuth } from './AuthContext';
import { AGENT_MODE_IDS } from '../constants/agentModes';

/**
 * AI feature-flag state for the browser.
 *
 * Fetched once per session from `GET /api/ai/config`, which returns booleans and
 * nothing else. The flags live in the environment on the server; the browser only
 * ever learns the resolved answer, so no configuration value and no secret
 * reaches the client.
 *
 * Two decisions worth stating:
 *
 * The request is only made once a recruiter is signed in. The endpoint is
 * authenticated like every other data route, so asking earlier would produce a
 * guaranteed 401 on every visit to the sign-in screen.
 *
 * Failure resolves to "AI is off" rather than to an error screen. This is a
 * supplementary feature: if its flag check cannot be completed, the correct
 * outcome is that the recruitment application carries on without AI navigation,
 * not that the dashboard breaks. That is what keeps the AI layer additive — with
 * `AI_ENABLED=false`, or with this endpoint failing entirely, the rest of the
 * product behaves exactly as it did before.
 */

const DISABLED_MODES = Object.freeze(
  AGENT_MODE_IDS.reduce((acc, id) => {
    acc[id] = false;
    return acc;
  }, {})
);

/** The shape a consumer can rely on before anything has loaded. */
const INITIAL = Object.freeze({
  enabled: false,
  modes: DISABLED_MODES,
  loading: true,
  isModeEnabled: () => false,
  refresh: () => {}
});

const AiConfigContext = createContext(INITIAL);

export const AiConfigProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();

  const [state, setState] = useState({ enabled: false, modes: DISABLED_MODES, loading: true });
  const controllerRef = useRef(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const body = await getAiConfig({ signal: controller.signal });
      if (controller.signal.aborted) return;

      const data = body?.data || {};
      // Normalized against the known mode list so the UI cannot be handed a mode
      // it has no page for, and every id is always present as a boolean.
      const modes = AGENT_MODE_IDS.reduce((acc, id) => {
        acc[id] = data.modes?.[id] === true;
        return acc;
      }, {});

      setState({ enabled: data.enabled === true, loading: false, modes });
    } catch {
      if (controller.signal.aborted) return;
      // Off is the safe resolution — see the note above.
      setState({ enabled: false, modes: DISABLED_MODES, loading: false });
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      controllerRef.current?.abort();
      setState({ enabled: false, modes: DISABLED_MODES, loading: false });
      return undefined;
    }

    load();
    return () => controllerRef.current?.abort();
  }, [isAuthenticated, load]);

  const value = useMemo(
    () => ({
      enabled: state.enabled,
      modes: state.modes,
      loading: state.loading,
      /**
       * A mode is usable only when the master switch and its own flag are both
       * on — the same rule the orchestrator applies server-side.
       */
      isModeEnabled: (id) => state.enabled === true && state.modes[id] === true,
      refresh: load
    }),
    [state, load]
  );

  return <AiConfigContext.Provider value={value}>{children}</AiConfigContext.Provider>;
};

/** @returns {{enabled: boolean, modes: Object, loading: boolean, isModeEnabled: Function, refresh: Function}} */
export const useAiConfig = () => useContext(AiConfigContext);

export default AiConfigContext;
