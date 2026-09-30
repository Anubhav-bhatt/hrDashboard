import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  fetchCurrentUser,
  login as loginRequest,
  signup as signupRequest,
  logout as logoutRequest,
  updateProfile as updateProfileRequest,
  changePassword as changePasswordRequest,
  onUnauthorized,
  toApiError
} from '../services/api';

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
  // Which workspace the recruiter is acting in. Resolved by the session probe;
  // sign-in and sign-up do not carry it, so it stays null until /auth/me answers.
  const [workspace, setWorkspace] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous
  const [sessionMessage, setSessionMessage] = useState('');

  const loadSession = useCallback(async () => {
    try {
      const response = await fetchCurrentUser();
      setUser(response.data.user);
      setWorkspace(response.data.workspace || null);
      setStatus('authenticated');
    } catch (error) {
      const apiError = toApiError(error);
      setUser(null);
      setWorkspace(null);
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
        setWorkspace(null);
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

  /**
   * Creates an account and leaves the person signed in.
   *
   * The server issues the same session cookies as sign-in, so there is no
   * second step and no bounce back to the login screen — the account exists and
   * the recruiter is already working.
   */
  const signUp = useCallback(async ({ name, email, password }) => {
    const response = await signupRequest({ name, email, password });
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
      setWorkspace(null);
      setStatus('anonymous');
      setSessionMessage('');
    }
  }, []);

  const updateUserProfile = useCallback(async ({ name }) => {
    const response = await updateProfileRequest({ name });
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const changeUserPassword = useCallback(async ({ currentPassword, newPassword }) => {
    const response = await changePasswordRequest({ currentPassword, newPassword });
    return response;
  }, []);

  const value = useMemo(
    () => ({
      user,
      workspace,
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      sessionMessage,
      clearSessionMessage: () => setSessionMessage(''),
      signIn,
      signUp,
      signOut,
      updateUserProfile,
      changeUserPassword,
      refresh: loadSession
    }),
    [
      user,
      workspace,
      status,
      sessionMessage,
      signIn,
      signUp,
      signOut,
      updateUserProfile,
      changeUserPassword,
      loadSession
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
};
