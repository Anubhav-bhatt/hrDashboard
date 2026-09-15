import React from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import AppShell from './components/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import JobsList from './pages/JobsList';
import CreateJob from './pages/CreateJob';
import JobDetails from './pages/JobDetails';
import ImportCandidates from './pages/ImportCandidates';
import CandidatesList from './pages/CandidatesList';
import CandidateProfile from './pages/CandidateProfile';
import NotFound from './pages/NotFound';

/**
 * Gate for every screen that shows candidate or job data.
 *
 * While the session is being established nothing is rendered but a spinner —
 * rendering children first would flash protected data before the redirect.
 * The attempted location is carried along so sign-in can return the recruiter
 * to where they were headed.
 */
const RequireAuth = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <Spinner label="Checking your session…" className="min-h-screen" />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  return <AppShell>{children}</AppShell>;
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

/** The job-scoped candidate list becomes a pre-filtered global list. */
const LegacyJobCandidatesRedirect = () => {
  const { jobId } = useParams();
  return <Navigate to={`/candidates?jobId=${jobId}&sort=score_desc`} replace />;
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

            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />

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
                <RequireAuth>
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

            {/* Preserved legacy routes */}
            <Route
              path="/jobs/:jobId/candidates"
              element={
                <RequireAuth>
                  <LegacyJobCandidatesRedirect />
                </RequireAuth>
              }
            />
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
