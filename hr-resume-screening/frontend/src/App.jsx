import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import AppShell from './components/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import { ProfileSkeleton, Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import JobsList from './pages/JobsList';
import CreateJob from './pages/CreateJob';
import JobDetails from './pages/JobDetails';
import CandidatesList from './pages/CandidatesList';
import JobCandidatesPage from './pages/JobCandidatesPage';
import NotFound from './pages/NotFound';

/**
 * The two heaviest, least-frequently-entered screens load on demand.
 *
 * The candidate profile pulls in the resume viewer and outreach composer; the
 * import screen carries the bulk-upload pipeline. Neither is needed to render the
 * dashboard, so keeping them out of the initial bundle shortens first load.
 */
const CandidateProfile = lazy(() => import('./pages/CandidateProfile'));
const ImportCandidates = lazy(() => import('./pages/ImportCandidates'));

/**
 * Gate for every screen that shows candidate or job data.
 *
 * While the session is being established nothing is rendered but a spinner —
 * rendering children first would flash protected data before the redirect.
 * The attempted location is carried along so sign-in can return the recruiter
 * to where they were headed.
 */
const RequireAuth = ({ children, fallback }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <Spinner label="Checking your session…" className="min-h-screen" />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  return (
    <AppShell>
      {/* Lazily-loaded routes show their own shaped skeleton while the chunk
          arrives, so a code-split screen does not flash an empty page. */}
      <Suspense fallback={fallback || <Spinner label="Loading…" />}>{children}</Suspense>
    </AppShell>
  );
};

/**
 * The job-scoped candidate URL is kept working: it redirects to the canonical
 * profile route so existing links and bookmarks do not break.
 */
const LegacyCandidateRedirect = () => {
  const { candidateId } = useParams();
  const location = useLocation();
  return <Navigate to={`/candidates/${candidateId}${location.search}`} replace />;
};


function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />

            <Route
              path="/candidates"
              element={
                <RequireAuth>
                  <CandidatesList />
                </RequireAuth>
              }
            />
            <Route
              path="/candidates/:candidateId"
              element={
                <RequireAuth fallback={<ProfileSkeleton />}>
                  <CandidateProfile />
                </RequireAuth>
              }
            />

            <Route
              path="/jobs"
              element={
                <RequireAuth>
                  <JobsList />
                </RequireAuth>
              }
            />
            <Route
              path="/jobs/new"
              element={
                <RequireAuth>
                  <CreateJob />
                </RequireAuth>
              }
            />
            <Route
              path="/jobs/:id"
              element={
                <RequireAuth>
                  <JobDetails />
                </RequireAuth>
              }
            />
            <Route
              path="/jobs/:jobId/import"
              element={
                <RequireAuth>
                  <ImportCandidates />
                </RequireAuth>
              }
            />

            {/* Canonical job-scoped candidate list. The job comes from the
                route, so refreshing and bookmarking preserve the scope. */}
            <Route
              path="/jobs/:jobId/candidates"
              element={
                <RequireAuth>
                  <JobCandidatesPage />
                </RequireAuth>
              }
            />

            {/* Preserved legacy route */}
            <Route
              path="/jobs/:jobId/candidates/:candidateId"
              element={
                <RequireAuth>
                  <LegacyCandidateRedirect />
                </RequireAuth>
              }
            />

            <Route
              path="*"
              element={
                <RequireAuth>
                  <NotFound />
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
