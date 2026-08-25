import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AiConfigProvider } from './context/AiConfigContext';
import { RecruitmentProvider } from './context/RecruitmentContext';
import { ToastProvider } from './components/ToastProvider';
import AiRouteGuard from './components/ai/AiRouteGuard';
import AppShell from './components/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import { ProfileSkeleton, Spinner } from './components/ui';
import RouteSkeleton from './components/ui/RouteSkeleton';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import JobsList from './pages/JobsList';
import ClosedJobs from './pages/ClosedJobs';
import Settings from './pages/Settings';
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
 * The AI section is code-split as a group.
 *
 * It is an additive area that many installations will run with `AI_ENABLED=false`
 * and never open. Keeping it out of the initial bundle means those deployments
 * pay nothing for its presence, which is what "additive" has to mean in practice
 * as well as in architecture.
 */
const AIAssistant = lazy(() => import('./pages/ai/AIAssistant'));
const ScreeningAgent = lazy(() => import('./pages/ai/ScreeningAgent'));
const RankingAgent = lazy(() => import('./pages/ai/RankingAgent'));
const ComparisonAgent = lazy(() => import('./pages/ai/ComparisonAgent'));
const InsightsAgent = lazy(() => import('./pages/ai/InsightsAgent'));

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
          {/* Inside AuthProvider: the flag endpoint is authenticated, so it is
              only queried once a recruiter has a session. */}
          <AiConfigProvider>
            {/* Also inside AuthProvider, because the working context is per
                account and is discarded when the signed-in user changes. */}
            <RecruitmentProvider>
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
              {/* The dashboard is the app root; /dashboard is accepted too so the
                  named URL can be linked and bookmarked. */}
              <Route
                path="/dashboard"
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
                path="/settings"
                element={
                  <RequireAuth>
                    <Settings />
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
              {/* Registered before /jobs/:jobId so "closed" is not read as an id. */}
              <Route
                path="/jobs/closed"
                element={
                  <RequireAuth>
                    <ClosedJobs />
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
                  <RequireAuth fallback={<RouteSkeleton variant="upload" label="Preparing resume import..." />}>
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

              {/* AI Recruitment. Every route sits inside the same RequireAuth
                  wrapper as the rest of the dashboard — there is no separate AI
                  auth path and no anonymous variant. AiRouteGuard then applies the
                  feature flags, so a disabled agent shows a stated reason instead
                  of a blank page. */}
              <Route
                path="/ai"
                element={
                  <RequireAuth fallback={<RouteSkeleton variant="ai" label="Loading AI Assistant..." />}>
                    <AiRouteGuard>
                      <AIAssistant />
                    </AiRouteGuard>
                  </RequireAuth>
                }
              />
              <Route
                path="/ai/screening"
                element={
                  <RequireAuth fallback={<RouteSkeleton variant="ai" label="Loading candidate screening..." />}>
                    <AiRouteGuard modeId="screening">
                      <ScreeningAgent />
                    </AiRouteGuard>
                  </RequireAuth>
                }
              />
              <Route
                path="/ai/ranking"
                element={
                  <RequireAuth fallback={<RouteSkeleton variant="ai" label="Loading candidate ranking..." />}>
                    <AiRouteGuard modeId="ranking">
                      <RankingAgent />
                    </AiRouteGuard>
                  </RequireAuth>
                }
              />
              <Route
                path="/ai/comparison"
                element={
                  <RequireAuth fallback={<RouteSkeleton variant="ai" label="Loading candidate comparison..." />}>
                    <AiRouteGuard modeId="comparison">
                      <ComparisonAgent />
                    </AiRouteGuard>
                  </RequireAuth>
                }
              />
              <Route
                path="/ai/insights"
                element={
                  <RequireAuth fallback={<RouteSkeleton variant="ai" label="Loading recruitment insights..." />}>
                    <AiRouteGuard modeId="insights">
                      <InsightsAgent />
                    </AiRouteGuard>
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
            </RecruitmentProvider>
          </AiConfigProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
