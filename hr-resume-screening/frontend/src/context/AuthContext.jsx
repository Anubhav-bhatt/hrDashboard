import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest, onUnauthorized, toApiError } from '../services/api';

const AuthContext = createContext(null);

/**
 * Session state for the dashboard.
 *
 * The session token itself lives in an httpOnly cookie the browser manages, so
 * nothing sensitive is kept in JavaScript. On boot the provider asks the API who
 * the current user is; a 401 simply means "signed out".
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous
  const [sessionMessage, setSessionMessage] = useState('');

  const loadSession = useCallback(async () => {
    try {
      const response = await fetchCurrentUser();
      setUser(response.data.user);
      setStatus('authenticated');
    } catch (error) {
      const apiError = toApiError(error);
      setUser(null);
      setStatus('anonymous');
      // A network failure is worth surfacing; an ordinary 401 is not.
      if (apiError.code === 'NETWORK_ERROR') {
        setSessionMessage('Unable to reach the server. Check your connection and try again.');
      }
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Any API call that comes back 401 means the session ended (expired or
  // revoked). Drop to anonymous so protected routes redirect to sign-in.
  useEffect(
    () =>
      onUnauthorized((apiError) => {
        setUser(null);
        setStatus('anonymous');
        setSessionMessage(
          apiError?.code === 'SESSION_EXPIRED'
            ? 'Your session expired. Please sign in again to continue.'
            : 'Please sign in to continue.'
        );
      }),
    []
  );

  const signIn = useCallback(async (email, password) => {
    const response = await loginRequest(email, password);
    setUser(response.data.user);
    setStatus('authenticated');
    setSessionMessage('');
    return response.data.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      // Clear locally even if the request failed, so the UI cannot keep showing
      // candidate data after the recruiter asked to sign out.
      setUser(null);
      setStatus('anonymous');
      setSessionMessage('');
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      sessionMessage,
      clearSessionMessage: () => setSessionMessage(''),
      signIn,
      signOut,
      refresh: loadSession
    }),
    [user, status, sessionMessage, signIn, signOut, loadSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
};
