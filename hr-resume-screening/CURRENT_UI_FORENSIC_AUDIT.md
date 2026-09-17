# Current UI Forensic Audit

> Scope: source-code audit of `frontend/` on 2026-09-17. No runtime session, API payload, or browser viewport was exercised. Statements labelled **runtime verification required** are intentionally not inferred.

## 1. Architecture discovery

| Concern | Confirmed implementation |
|---|---|
| Framework/build | React 18.3 + Vite 6 (`frontend/src/main.jsx`, `vite.config.js`) |
| Routing | `react-router-dom` 6 `BrowserRouter`, explicit `Routes` in `frontend/src/App.jsx` |
| Styling | Tailwind 3 utility classes plus global `index.css`, CSS-token palette in `src/styles/tokens.css`; no CSS modules or component-library dependency |
| Icons | `lucide-react` |
| HTTP/API | One Axios instance in `src/services/api.js`; `withCredentials: true`, HTTP-only-cookie session; `aiService.js` reuses it |
| Server state | `useApiResource`: abortable fetch, error normalization, loading/refetching state |
| App state | React Context: Auth, AI config/feature flags, recruitment working context, theme, workspace mode; local component state otherwise |
| Forms/tables/charts | Native controlled inputs/forms; hand-built HTML tables and responsive lists; no dedicated form, table, chart, or dialog library |
| Design system | `components/ui/index.jsx` exports Button, Card, Alert, Empty/Error/Skeleton states, Tabs, Badge/StatusBadge, Avatar, copy control, etc. |

Important directory map: `pages/` (route screens); `pages/ai/` (AI routes); `components/` (shared/layout); `components/candidate`, `jobs`, `workspace`, `dashboard`, `ai` (feature components); `context/`; `hooks/`; `services/`; `constants/`; `utils/`; `styles/`.

Provider order is `ThemeProvider → ErrorBoundary → ToastProvider → AuthProvider → AiConfigProvider → RecruitmentProvider → WorkspaceModeProvider → Routes`. `RequireAuth` wraps all routes except `/login`; it displays a session spinner while checking, then redirects anonymous users to `/login` with the attempted URL in route state. A global `ErrorBoundary` offers reload/dashboard recovery for unhandled render errors.

## 2. Route inventory

| Route | Page/component | Access/layout | Purpose and notable children |
|---|---|---|---|
| `/login` | `Login.jsx` | anonymous, no shell | Sign in; redirects authenticated users to attempted location or `/dashboard` |
| `/`, `/dashboard` | `Dashboard.jsx` | authenticated `AppShell` | Dashboard; optional `?jobId`; `MinimalHome` replaces standard content in minimal mode |
| `/candidates` | `CandidatesList.jsx` | authenticated | Global `CandidateBrowser`; optional `jobId` query scope |
| `/candidates/:candidateId` | lazy `CandidateProfile.jsx` | authenticated, profile skeleton | Candidate profile with `?tab=` |
| `/jobs` | `JobsList.jsx` | authenticated | Jobs portal: `search`, `status`, `sort`, `page` query state |
| `/jobs/closed` | `ClosedJobs.jsx → JobsList` | authenticated | Jobs list locked to `CLOSED`; still renders active/closed switcher outside minimal mode |
| `/jobs/new` | `CreateJob.jsx` | authenticated | Create job and optional criteria |
| `/jobs/:id` | `JobDetails.jsx` | authenticated | Job control centre; `?tab=overview|criteria`; legacy `tab=candidates` redirects to its canonical candidate route |
| `/jobs/:jobId/import` | lazy `ImportCandidates.jsx` | authenticated, upload skeleton | Manual/folder upload or Outlook discovery/import |
| `/jobs/:jobId/candidates` | `JobCandidatesPage.jsx` | authenticated | Job KPI context plus job-fixed `CandidateBrowser` |
| `/jobs/:jobId/candidates/:candidateId` | `LegacyCandidateRedirect` | authenticated | Replace-redirects to `/candidates/:candidateId`, preserving query string |
| `/settings` | `Settings.jsx` | authenticated | Account, appearance, Outlook integration |
| `/ai` | lazy `AIAssistant.jsx` | authenticated + `AiRouteGuard` | Conversational assistant and mode launcher |
| `/ai/screening` | lazy `ScreeningAgent.jsx` | authenticated + flag guard | Candidate/job screening; `jobId`, `candidateId`, `source` queries |
| `/ai/ranking` | lazy `RankingAgent.jsx` | authenticated + flag guard | Ranking; `jobId` query/context |
| `/ai/comparison` | lazy `ComparisonAgent.jsx` | authenticated + flag guard | 2–5 candidate comparison; `jobId`, `candidateIds`, `source` |
| `/ai/insights` | lazy `InsightsAgent.jsx` | authenticated + flag guard | Workspace/current-job metrics and AI questions |
| `/focus` | lazy `MinimalistWorkspace.jsx` | authenticated | Minimal work surface; workspace preference is also switched to minimal |
| `*` | `NotFound.jsx` | authenticated shell | Unknown protected URL recovery: dashboard or history back |

`AiRouteGuard` gets `GET /ai/config`; disabled AI globally or per-mode renders an explanatory unavailable state instead of exposing the screen. It is a feature-flag guard, not RBAC.

### Navigation tree and observed flows

```text
Dashboard → Jobs → Job workspace → Candidates → Candidate quick look/profile
                              ├→ Add candidates (manual/folder/Outlook)
                              ├→ Rank → Compare → Screen
                              └→ Close job → Closed Jobs → (Admin) permanent deletion
Dashboard → Candidates (global) → Quick look → Profile → screen/email/contact/notes
Shell/command palette → Dashboard, Jobs, Candidates, Closed Jobs, Settings, AI routes
```

The standard sidebar has Dashboard; Jobs; Candidates; Closed Jobs; Settings; AI Assistant and Insights; a collapsible AI tools group for Screening, Find Best Matches/Ranking, and Compare Candidates. In minimal mode the rail uses Home, Active Jobs, Candidates, Closed Jobs, Assistant, Settings; specialist AI tools are entered from contextual work links. Header navigation provides mobile menu, breadcrumbs, command palette (Cmd/Ctrl+K), minimal-mode toggle, theme toggle, and account menu (Settings/Sign out). AI entries are visible-but-disabled with “Soon” when their flag is false.

## 3. Page-by-page UI audit

### Login — `/login` — `pages/Login.jsx`

Two-column desktop layout (fixed dark value/brand panel hidden below `lg`; sign-in form always visible). Inputs: required Work email (`email`, email regex) and Password; eye icon toggles password visibility. Submit calls `POST /auth/login`; successful login navigates to the preserved protected URL; failure clears password and shows inline API error. Loading session shows a full-screen spinner. It announces AuthContext’s network/session-expiry message. No self-registration, reset-password, or role selector exists.

### Dashboard — `/` and `/dashboard` — `pages/Dashboard.jsx`

`GET /dashboard/overview` (optionally `jobId`) and `GET /jobs/summary?status=OPEN&sort=newest` drive this page. Header has a job-scope select only with more than one open job, refresh, and Create job. Standard layout: snapshot KPI links (open jobs/candidates/strong/shortlisted, or job-scoped equivalents), recommended next step, needs attention, recent hiring roles, pipeline, match-quality bands, optional “continue where you left off,” and up to five recent candidate rows. Pipeline, score-band and KPI controls navigate to candidate filters; role title/actions navigate into work. No open jobs produces Create Job empty state; initial loading uses skeletons; overview and job-fetch errors are separate retry/inline messages. In minimal mode it renders `MinimalHome` from the same data instead of the standard panels.

### Candidates — `/candidates` — `pages/CandidatesList.jsx`

Page header displays global/selected-job total passed upward from the browser. “Browse by job” goes to `/jobs`; an optional Job select gets open jobs from `GET /jobs/summary`, writes `jobId` and clears `page`. `CandidateBrowser` owns all candidate interaction below.

### Job candidates — `/jobs/:jobId/candidates` — `pages/JobCandidatesPage.jsx`

`GET /jobs/:id/summary` supplies breadcrumb/header fields: title, creation date, first eight required skills (+overflow), counts (total, threshold-plus strong, shortlisted, needs review, best/average score). Links go to jobs, details, and import. An amber alert appears where `analyzedCount < candidateCount`. The job-fixed candidate browser defaults to score descending. Loading skeleton, 404 “Job not found,” and generic retry states are implemented.

### Shared candidate browser — `components/candidate/CandidateBrowser.jsx`

Used by global and job pages. It calls `GET /candidates` or `GET /jobs/:jobId/candidates`, plus `GET /candidates/filters`; all supported filter state is URL-backed: `search`, `hrStatus`, `minScore`, `maxScore`, `experienceRange`, `skill`, `location`, `qualification`, `sort`, `page`, `limit`, and global-list `jobId`. Search debounces 350ms. Toolbar: search/clear icon, sort, More filters drawer, persisted grid/table toggle, All/Best matches/status preset. Active filter chips remove individually or clear all. Drawer fields: optional parent job filter, min score, experience, location, skill, qualification, maximum score; Done/clear controls. 

Results may be cards or a table/list; only one representation mounts. Empty state differs for no filtered result, empty job (Add candidates), and empty global pool (Create job). Pagination changes URL, supports limit change, and scrolls to top. Comparing requires 2–5 candidates from one job; selection bar exposes Clear and Compare. A sixth or cross-job candidate shows a toast. Candidate quick view is a drawer with ArrowUp/ArrowDown navigation, status select, Screen, comparison/shortlist controls, and full-profile navigation. The action-sheet drawer is used for mobile/more actions.

### Candidate profile — `/candidates/:candidateId` — `pages/CandidateProfile.jsx`

`GET /candidates/:id` populates the whole page. Header fields: avatar/name, headline/current role/company, HR status, match %, location, total experience, email/phone (mailto/tel and copy), application job/created date/source, and selected-candidate banner/date. Actions conditionally expose Email candidate (disabled without email), Call, LinkedIn, Open/Download resume, text-resume tab, Screen with AI, Add note, and a status select (not for `SELECTED`).

Tabs are URL backed: Overview (summary/extraction warnings, skills/matched/missing, experience, education, contact, match breakdown/reanalyse, conditional compensation); Experience (experience/projects/education/certifications); Skills (skills/certifications/languages/achievements); Resume; Notes; Activity. The Notes form is a 5,000-character textarea, POSTs an appended note, refetches, and disables empty submit. Re-analysis posts the candidate analysis endpoint. Resume download uses a blob request; open resume uses the authenticated API URL. Outreach is a modal that creates a prefilled subject/body, supports copy and `mailto:` (there is no send API). 404 gets a dedicated recovery state; other errors retry; loading is profile skeleton. Missing resume fields render explicit fallbacks or omit their section.

### Jobs and Closed Jobs — `/jobs`, `/jobs/closed` — `pages/JobsList.jsx`, `ClosedJobs.jsx`

Server-side `GET /jobs/summary` uses `search`, `sort`, `status`, `page`, `limit=12`. Search debounces 350ms. Sort choices differ for active/closed. Active/Closed pill tabs are absent in minimal mode; `/jobs/closed` locks `CLOSED` even if a query is altered. Result count, skeleton, error/retry, meaningful empty states, and pagination exist. Standard desktop is a table-like grid: Role, Candidates, Strong, Shortlisted, Next/Outcome; below `lg` it reflows as summary cards. Minimal mode renders `JobWorkItem` rows.

Each job row/card displays lifecycle/status, title, candidate and score/count facts, recommended action/outcome, and a menu: Job workspace; for open jobs Add candidates, Rank candidates, and Close job when shortlist exists; for closed jobs Admin-only Delete job data. Closing first fetches `GET /jobs/:id/shortlist`, then opens the radio-choice dialog. Admin deletion first fetches measured destruction preview, then opens a title-typed confirmation dialog. Both mutations refetch results and communicate through toasts/errors.

### Create job — `/jobs/new` — `pages/CreateJob.jsx`

Three sections: Job information (required title); Job description (required PDF/DOCX/TXT, ≤5MB); optional candidate criteria. Token popovers manage required/preferred skills, keywords, locations, qualifications (free text, suggestions, case-insensitive duplicate prevention; removable chips). Numeric min/max experience and salary validate nonnegative ascending ranges. Submit first multipart `POST /jobs` (`title`, `jdFile`) then conditionally `PATCH /jobs/:id/search-criteria`; successful creation navigates to job details, and a criteria-save failure still navigates after a toast. Cancel returns to jobs. All controls disable while submitting.

### Job workspace — `/jobs/:id` — `pages/JobDetails.jsx`

Data sources: `GET /jobs/:id`, job summary, and top five score-sorted job candidates. Breadcrumb/header show JD file name, created date, job status, derived scoring stage. Open jobs expose View candidates and Close job; closed jobs expose selected candidate. Open jobs show six-step lifecycle (Created, Candidates added, Review matches, Shortlist, Select, Close) and one recommendation derived from counts; mobile lifecycle expands/collapses. Snapshot tiles link to candidate filters. Unscored candidates show “Score them now.”

Tabs: Overview and Job criteria. Overview shows top candidates, requirements summary, expandable More details/JD text, and closed-job next steps. Criteria is read-only until Edit criteria; edit controls mirror creation criteria and validate ranges, save with `PATCH /jobs/:id/search-criteria`; re-score all posts analysis when candidates are scored and job remains open. Closing chooses a shortlisted candidate; closed jobs prohibit imports/re-analysis visually. A closed job shows archive/selected-hire facts. The destructive section exists only for `user.role === 'ADMIN'` and closed status. `?tab=candidates` delegates by redirect to canonical job candidates screen.

### Import candidates — `/jobs/:jobId/import` — `pages/ImportCandidates.jsx`

Initialization fetches job and Outlook connection/folders. If the job is closed, an empty state directs to job/candidate records rather than accepting candidates. Source chooser: Manual upload or Outlook mailbox; Change method preserves entered source state. Manual flow has hidden native multi-file and directory inputs, drag/drop, and accepts `.pdf/.docx/.txt`; unsupported files remain listed as ignored. It computes file-type counts/total size and processes valid files in sequential chunks of 25 with per-file `WAITING → PROCESSING → SUCCESS|DUPLICATE|FAILED|UNSUPPORTED`, progress counts, completion result, view-candidates, and clear controls. It posts multipart bulk upload with relative paths.

Outlook flow conditionally offers Connect Outlook (full-page OAuth URL) or connected account/disconnect. Connected workflow contains Mail Folder select, From/To date inputs, Find Applications, result scan counts, then Process Discovered Resumes (only enabled where attachments discovered). Search posts folder/date payload; processing posts selected attachment metadata. Errors are inline. Runtime verification required for OAuth redirect/connection flow and server processing semantics.

### Settings — `/settings` — `pages/Settings.jsx`

Desktop sticky section rail/mobile horizontal anchors: Account, Appearance, Integrations. Account shows AuthContext name/email/role, Sign out. Appearance has ThemeSelector (light/dark/system persisted locally). Integrations gets Outlook status; connected state shows email/display name and Disconnect; otherwise Connect mailbox navigates to OAuth. The static Candidate data card is informational. Outlook status failure silently presents disconnected; no dedicated error state.

### Minimal workspace — `/focus` — `pages/MinimalistWorkspace.jsx`

The focused route reads workspace/recruitment context plus jobs, summaries and candidate data. It presents a job rail/select, selected job work queue/progress/recommended action, best-fit candidates, contextual AI tools, and quick candidate interactions/comparison handoff. It preserves normal underlying routes/data but reduces chrome; leaving minimal mode returns to its stored session return path. **Runtime verification required** for its exact composition/animation transitions; component source confirms local/session preference persistence and reduced-motion handling.

### AI Assistant — `/ai` — `pages/ai/AIAssistant.jsx`

Uses current job context if present (`GET /jobs/:id/summary`) and keeps an in-memory message list. Quick prompts and AgentInput call `POST /ai/run` mode `assistant`; returned assistant content/actions can route to dedicated modes. Users can clear conversation. It conditionally shows current job metrics/recommendation, enabled contextual agent links, or five task cards (ranking, screening, comparison, insights) filtered by feature flag. Loading/error states cover current job and assistant request separately.

### Screening — `/ai/screening` — `pages/ai/ScreeningAgent.jsx`

URL/context resolves job and candidate; setup has JobPicker, candidate picker, optional instruction and Analyse. Known URL selections auto-run once. It posts `runAgent({mode:'screening', context:{jobId,candidateIds}})`. Result shows candidate/job title, fit and recommendation badges, summary, strengths, concerns/gaps, requirements/evidence, optional expandable criteria detail, warnings, Screen Another and contextual return/AI Assistant. Setup can be re-opened. Missing selection gets explanatory empty state; request failures retry while retaining selection.

### Ranking — `/ai/ranking` — `pages/ai/RankingAgent.jsx`

`jobId` URL takes precedence over recruitment context and auto-runs once per job. Expanded setup: JobPicker, radio scope All/Shortlisted, optional min score disclosure, free-text ranking preference and suggestion chips. It sends `POST /ai/run` mode `ranking` with `candidateScope`/optional minimum score; stores ranked IDs in recruitment context. Result shows job/count/methodology/preference, warnings, ranking table, Screen actions, Compare Top 2/3 and checkbox-selected 2–5 comparison. Input refinement is visibly disabled as future functionality.

### Comparison — `/ai/comparison` — `pages/ai/ComparisonAgent.jsx`

Requires job and 2–5 candidate IDs. `CandidateMultiPicker` supports selection/removal; a job-origin comparison can prefetch shortlist and preselect it when 2–5. Focus instruction disclosure and chips are optional. POST mode `comparison` records comparison IDs. Result grid includes comparison summary/focus, per-candidate columns/actions (Screen, Shortlist, remove when >2), criterion matrix, tradeoffs, mandatory gaps, strongest dimension cards, strengths/gaps, data warnings, Back to ranking, and reset. Failures preserve selection for retry.

### Insights — `/ai/insights` — `pages/ai/InsightsAgent.jsx`

Gets dashboard overview scoped to current job context if any. It shows Candidates/Open roles/Strong matches/Awaiting review cards (some links), derives default attention/opportunity cards from live counts, and sends quick/custom questions to mode `insights`. Custom result may reset to deterministic overview. It renders loading skeleton, metrics warning, analysis error, attention/opportunity groups, or “caught up.”

### Not Found — wildcard — `pages/NotFound.jsx`

Displays the unmatched pathname and offers Dashboard and history back. It is protected, so anonymous unknown paths are first sent to sign-in.

## 4. Button and action inventory

This table records the distinct user-facing action contracts. Repeated card/table/mobile renderings that invoke the same handler are intentionally consolidated and cross-referenced to their source owner.

| Control/action | Pages/components | Handler/result | Conditions/restrictions |
|---|---|---|---|
| Sign in / show-hide password | Login | local validation, `signIn`; password input type toggle | email/password required; submit disabled/loading while request runs |
| Dashboard scope, refresh, clear scope | Dashboard | URL `jobId` replace; refetch overview/jobs; remove scope | selector only with >1 open job |
| Dashboard KPIs/pipeline/score bands/role action | Dashboard | links to filtered candidates/job workflow | figures and targets derive from overview/jobs data |
| Job/candidate search clears | JobsList/CandidateBrowser | resets local input then 350ms URL query update | clear icon only when text nonempty |
| Job status tabs/sort/page | JobsList | URL state; fetch server page; history Active switch navigates to `/jobs` | status tabs hidden in minimal; closed route locks CLOSED |
| Job row title/workspace/add/import/rank | JobSummaryCard/JobWorkItem | route navigation | import/rank not rendered for closed jobs |
| Close job | JobsList, JobDetails, JobNextStep, JobSummaryCard | fetch shortlist, open dialog; POST close; refetch/show toast | requires at least one shortlisted candidate; no control on closed job |
| Delete job data | JobsList, JobDetails | fetch deletion preview; typed-title dialog; DELETE; navigate/refetch | `ADMIN` and `CLOSED` only |
| Create job/Cancel | Dashboard/Jobs/empty states/CreateJob | navigate or submit multipart creation | creation submit requires title + supported JD; controls disabled while saving |
| Token add/remove/suggestions | CreateJob/JobDetails/TokenInput | local list mutation; keyboard Enter/Escape/arrows | duplicate values blocked case-insensitively; editor disabled saving |
| Edit/cancel/save criteria; re-score | JobDetails | local draft, PATCH criteria, POST analyze all, refetch/toast | no re-score on closed job; numeric validation blocks save |
| Job lifecycle/details disclosure | JobDetails/JobLifecycle | local expand/collapse | lifecycle disclosure only mobile; JD body only when Show is active |
| Candidate filter drawer/view toggle | CandidateBrowser | drawer state; writes localStorage view preference | changing visual mode does not refetch |
| Candidate status/Shortlist/Retry | Candidate cards/table/quick view | shared `useCandidateStatus`, optimistic list update, PATCH status, toast/inline retry | selected/shortlisted cannot be shortlisted; selected excluded from status options |
| Quick look/full profile/previous/next | Candidate cards/table/browser drawer | drawer selection; `navigate('/candidates/:id')`; ArrowUp/Down movement | prev/next bounded to current page results |
| Screen candidate | cards/quick view/profile/ranking/comparison | route to AI screening with job/candidate/source query | disabled when a card lacks job id |
| Compare selection/Clear/Compare | Candidate browser/ranking table | local selected ids then comparison route | exactly 2–5, single job in browser; control disables at cap |
| Contact/copy/resume/outreach | CandidateProfile/contact/outreach | `mailto`, `tel`, safe external LinkedIn, clipboard, authenticated resume open/download, outreach dialog | absent/disabled according to contact/resume fields |
| Notes/reanalyse | CandidateProfile | POST note/refetch; POST analyse/refetch | note submit disabled when blank; reanalysis has loading state |
| Import method/file/folder/process/clear | ImportCandidates | source state, native input click/drop, sequential chunk upload, clear state | closed job blocked; only supported files processed; no retry-one-file control found |
| Outlook connect/disconnect/find/process | Settings/ImportCandidates | full-page OAuth, POST disconnect/search/process | search requires selected folder; process requires discovered resume attachments |
| AI prompt/quick prompt/reset | Assistant/Insights | `runAgent`; append messages/custom results; clear/reset local conversation/result | disabled when relevant mode unavailable or request active |
| AI job/candidate setup and agent runs | Screening/Ranking/Comparison | URL/context update; POST agent run; show progress/result/retry | Screening needs job+candidate; ranking needs job; comparison needs job+2–5 ids |
| AI result handoffs | ranking/comparison/assistant/insights | Screen, compare, remove selection, shortlist, link to workflow | depends on structured result fields and mode enablement |
| Theme/minimal/sidebar/AI group | shell/settings | local/session preference, navigation between focus/origin, collapse toggles | reduced-motion preference suppresses workspace transition |
| Command palette/mobile nav/account | AppShell/CommandPalette | open/close, keyboard Cmd/Ctrl+K, navigation, sign out | mobile drawer uses Escape/focus return; account closes on outside/Escape |
| Toast dismiss / error reload | ToastProvider/ErrorBoundary | local toast removal / full `window.location.reload()` | error boundary detail only in development |

## 5. Dynamic-data and API-to-UI mapping

| Service/API | Used by | Visible fields/effects |
|---|---|---|
| `GET /auth/me`, `POST /auth/login`, `/auth/logout` | Auth/login/shell/settings | user name, email, role; session redirects/messages |
| `GET /dashboard/overview` | Dashboard, Insights | metrics, scope/title, threshold, pipeline, score bands, recent candidates, overview jobs/activity-derived findings |
| `GET /jobs/summary` | Dashboard, Jobs, Candidates job filter | job id/title/status, aggregate counts/scores, pagination/status facets |
| `GET /jobs/:id`, `/summary` | Details, job candidates, import, AI assistant | job/JD/requirements/status/dates/hire; candidate stats/threshold |
| `GET /candidates`, `/jobs/:id/candidates`, `/candidates/filters`, `/candidates/:id` | Browser/table/cards/profile | all candidate identity, role, experience, skills, location, HR status, score analysis, full parsed profile and timeline |
| candidate status/notes/analyse endpoints | browser/profile | shortlist/status update, note timeline, refreshed scoring; success/error toasts |
| resume endpoints | profile/resume viewer | available/file name, embedded/open/download document |
| `POST /jobs`, criteria patch | Create/details | created job/parsed requirements; criteria values and rescore prompt |
| shortlist/close/deletion preview/delete | jobs/details/dialogs | candidate radio options, selected hire/closed state, destructive counts, navigation/toasts |
| upload/bulk Outlook APIs | Import/settings | source state, folders/mail scan totals, file/app processing states |
| `GET /ai/config`, `POST /ai/run` | guard/shell/AI pages | feature availability; agent structured results, progress/errors/actions |

Common transformations: dates use `formatDate`/relative forms; experience/phone/salary use `utils/format`; score is rounded percent and mapped to score bands; status is mapped by `HR_STATUS_META`; dashboard threshold comes from API (default 80 only when absent); candidate skill display favors `matchAnalysis.matchedSkills`, then parsed skills. Candidate and job fallbacks are explicitly shown in the relevant page descriptions above, rather than silently omitted in every case.

### Visible dynamic-field mapping

| UI field family | Page/component | API/state path | Display transformation/conditional |
|---|---|---|---|
| Dashboard metrics | Dashboard | `overview.metrics.{openJobs,totalCandidates,strongMatch,shortlisted,pendingReview}` | localized counts; job scoped labels differ |
| Dashboard pipeline/bands | Dashboard | `overview.pipeline[]`, `scoreBands[]`, `strongMatchThreshold` | percentage track width; links compose status/min/max score queries |
| Job summaries | Jobs/Dashboard/rail | summary `job.{id,title,status,candidateCount,analyzedCount,strongMatchCount,shortlistedCount,pendingReviewCount,bestMatchScore,selectedCandidate}` | derived action/status; numeric fallbacks zero/Not scored |
| Candidate-list identity | card/table/quick look | candidate `{_id,name,headline,currentRole,currentLocation,totalExperience,qualification,jobId,jobTitle}` | Unknown/Role not specified/Not stated fallbacks |
| Candidate list scoring | card/table/quick look | `matchAnalysis.{overallScore,alignmentLabel,matchedSkills,missingRequiredSkills,strengths,gaps,summary}` | rounded `%`, score band; `--/Not scored` when null; matched skills preferred |
| Candidate list status | all candidate record renderers | `hrStatus`, `extractionStatus`, mutation errors | `HR_STATUS_META`; processing/error/comparison/selected card states |
| Profile personal | CandidateProfile/ContactCard | `personal.{currentLocation,email,phone,linkedin}` | omitted if unavailable except location fallback; safe URL/tel formatting |
| Profile professional | CandidateProfile/sections | `professional.{headline,currentRole,currentCompany,totalExperienceYears,summary,currentSalary,expectedSalary}` | role/company concatenated; formatted experience/salary; compensation card only when supplied |
| Profile application/resume | CandidateProfile/ResumeViewer | `application.{jobId,jobTitle,appliedAt,source}`, `resume.{available,fileName}`, resume text | direct/Outlook source label; date formatting; file action conditionals |
| Profile detailed arrays | CandidateSections/Timeline | skills, experience, educationDetail/education, projectsDetail/projects, certifications, languages, achievements, notes, noteEntries, activities, extractionWarnings | sections supply absence copy or omit as implemented; timeline groups by date |
| Job requirements | JobDetails/CreateJob | `requirements.{requiredSkills,preferredSkills,searchKeywords,preferredLocations,qualifications,minimumExperience,maximumExperience,salaryMin,salaryMax,salaryCurrency}` | chips, numeric range/salary formats, `Not set`/Any fallback |
| Job candidate KPIs | JobCandidates/JobDetails | summary `stats.{candidateCount,strongMatchCount,shortlistedCount,needsReviewCount,analyzedCount,bestMatchScore,averageMatchScore,selectedCount}` | threshold is API `strongMatchThreshold`; unscored/remaining count alerts |
| Close/delete dialog data | dialogs | shortlist candidate id/name/role/experience/score; deletion `counts.{candidates,storedResumes,notes,activities}` | candidate radios; deletion lines omit zero counts |
| Import progress | ImportCandidates | local file objects + bulk response item status/result/error | counts/status per item, completion state, unsupported category |
| Outlook data | Settings/ImportCandidates | connection `{connected,email,displayName}`, folders `{id,name}`, scan `{emailsScanned,resumesDiscovered,applications}` | connected/not connected badge; process action only with attachments |
| AI results | AI pages | response `content`, `structuredData` per mode | pages defensively show empty/error/warning; exact structured field presentation is mode-specific |

## 6. Tables, forms, overlays, and action inventory

### Record/table structures

| Surface | Columns/record fields | Behaviors |
|---|---|---|
| CandidateTable desktop | comparison checkbox; Candidate (avatar/name/headline); Match; Experience; Top skills; Status; Actions | skills hidden below `xl`, experience below `lg`; horizontal scroll from `md`; Quick Look + action sheet; status write is via shared actions |
| CandidateTable mobile | checkbox, identity, score, first skills, experience, status, more action | stacked list below `md` |
| Candidate cards | avatar, match/not scored, name/headline, ≤3 skills, experience, status, quick-action dock | body opens quick look; more action sheet for touch; action dock is CSS pointer-capability dependent |
| Jobs list | Role, Candidates, Strong, Shortlisted, Next/Outcome | desktop labels at `lg`; stacked/card form below; menu actions described above |
| Ranking results | selection, rank, candidate/status/priority, score, fit, strengths, gaps/mandatory gap, Screen | desktop table and mobile cards; select 2–5 comparison |
| Comparison results | candidate header columns plus criteria matrix | side-by-side matrix, additional tradeoffs/gaps/evidence cards; exact overflow requires runtime viewport verification |

Forms are: Login; Create Job; Job criteria editor; Notes; Close Job (hire radio); Delete Job (typed title); Import Outlook search. Inputs/form validation and endpoints are specified in the respective page audits. There is no traditional Edit Candidate form.

| Overlay/control | Trigger and behavior |
|---|---|
| Candidate quick-view drawer | card/table eye/name; Escape/click backdrop/close; ArrowUp/Down moves current result; footer opens profile |
| More filters drawer | Candidate browser More filters; filters are URL-backed; Done closes, Clear all resets |
| Candidate action drawer | card/table more action; same Quick Look/Screen/Compare/Shortlist definitions |
| Token popover | Add skill/keyword/location/qualification; keyboard Enter/Escape/arrows and suggestion list |
| Outreach dialog | Profile Email candidate; edit subject/body, copy, opens `mailto:`; focus trap/Escape/backdrop close |
| Close job dialog | job close action; shortlist radio, explicit consequences, confirm; focus trap/Escape/backdrop |
| Delete job dialog | Admin closed job; preview counts and normalized exact title required; focus trap/Escape/backdrop |
| Job details disclosure | More details Show/Hide JD text |
| Job lifecycle mobile disclosure | current stage opens full six-stage list |
| AI setup/filter disclosures | ranking advanced minimum score; comparison focus; setup edit toggles |
| Command palette | header button/Cmd/Ctrl+K; search/navigation and job-aware commands; Escape/backdrop close (runtime verification required) |
| Toasts | mutation/copy/session feedback; error 6s, others 3.5s, manual dismiss, live region |

## 7. State, authorization, conditionals, responsive system

### Authorization and preservation rules

| UI element | Rule/location |
|---|---|
| All data routes | `RequireAuth`; anonymous redirect to Login, no protected child render while session loading |
| AI navigation/routes | `AiConfigContext` + `AiRouteGuard`; disabled modes unavailable/“Soon”; backend remains authority |
| Delete job data | only `user.role === 'ADMIN'` **and** job status `CLOSED`; Jobs list and JobDetails both enforce UI condition |
| Candidate status | `SELECTED` cannot be selected in profile/quick-look selects; job closure performs selection; selected candidates cannot be shortlisted again |
| Close job | shortlist must have at least one candidate; dialog explains/refuses otherwise |
| Import/re-analysis | visually withheld/disabled for closed job; job closure preserves history |
| Comparison | 2–5 candidates, same `jobId`; browser and ranking enforce cap; AI page validates usable selection |

Important persisted frontend state: theme (`localStorage`, light/dark/system); sidebar collapse, AI group/tools collapse, candidate view (`localStorage`); workspace mode (`localStorage`) and return path/recruitment working context (`sessionStorage`). Recruitment context holds current job, selected candidates, active filters, source workflow, and latest ranking/comparison ids; URL wins for job context. The app tracks reduced-motion preference.

Responsive source evidence: standard rail is desktop and a modal mobile nav opens on small viewports; rail collapses to icons at `lg`. Login brand panel begins `lg`. Dashboard/cards generally go from one/two to four columns at `md`/`xl`; jobs headers appear `lg`; CandidateTable swaps to mobile list below `md`; ranking table swaps below `md`; table wrappers confine horizontal overflow. Settings rail is sticky at `lg` and horizontal scroller below. Dialogs are bottom sheets on small screens and centered cards from `sm`. No runtime breakpoint claim beyond these source classes is made.

## 8. Visual-system audit

The application has a tokenized blue/slate enterprise UI. `tokens.css` supplies light and inverted-neutral dark RGB ramps; Tailwind maps `white`, slate, brand, emerald, amber, rose, violet, sky, teal and semantic aliases to those variables. `ThemeContext` stores light/dark/system and toggles the root `.dark` class. Font is Inter/system sans; named scale: display 30px, page 24px, section 18px, card 15px, body 14px, meta 13px, label 12px, metric 30px. Spacing uses a 4px scale. Radii: controls 7px, cards 10px, panels/overlays 14px, pills full. Resting cards have restrained/no visual elevation; overlays use `shadow-overlay`. Buttons have primary/secondary/ghost/destructive variants; semantic status badges use brand/success/warning/danger/neutral. Styling source is global CSS + Tailwind utilities; no runtime component library theme exists.

## 9. Component relationship inventory

| Component group | Responsibility / consumers |
|---|---|
| `AppShell`, `CommandPalette`, `ThemeSelector`, `WorkspaceModeToggle` | protected frame, navigation, command interactions, preference controls |
| `CandidateBrowser → CandidateCard/CandidateTable → CandidateQuickView/CandidateActions` | shared browsing, card/table presentations, drawers, list mutations/compare handoff |
| `CandidateProfile → CandidateSections/ContactCard/MatchPanel/ResumeViewer/Timeline/OutreachDialog` | full parsed-resume profile and contacts/evaluation/history |
| `JobsList → JobSummaryCard/JobWorkItem → CloseJobDialog/DeleteJobDialog/Pagination` | job discovery, lifecycle actions/history |
| `JobDetails → JobLifecycle/JobNextStep/TopCandidates/TokenInput` | operational job workspace and criteria editor |
| `ImportCandidates` | direct file/folder and Outlook ingestion workflows (does not use generic FileDropZone) |
| `AgentShell → AgentHeader/Selector/Pickers/Input/Progress/ResultContainer` | common AI structure; each agent owns request/result mapping |
| `RankingResultTable`, `ComparisonResultGrid`, `ComparisonMatrix`, `CandidateColumns` | AI ranking/comparison data display and handoffs |
| `MinimalistWorkspace → JobRail/ProgressJourney/BestFits/RecommendedNextStep/AIPowerTools` | low-chrome, contextual work path |
| `ui/index.jsx`, `Drawer`, `FileDropZone`, `FormSection`, `TokenInput`, `RouteSkeleton` | cross-feature primitives |

## 10. Functional preservation matrix

The following are required to survive any redesign:

- [ ] Preserve all 21 explicit route behaviors, including root/dashboard alias, lazy-route skeletons, wildcard recovery, and legacy candidate redirect.
- [ ] Preserve authenticated cookie-session gate, deep-link return after login, and global 401 sign-out handling.
- [ ] Preserve all URL-backed candidate/job filters, pagination, sorting, tab state, and job/candidate/AI handoff query parameters.
- [ ] Preserve candidate card/table choice, quick look, same-job 2–5 comparison constraint, shortlist mutation/retry, and full-profile route.
- [ ] Preserve all candidate profile fields, contact/copy/mail/tel/link behaviors, resume open/download/text viewer, notes timeline, re-analysis, and selected-status immutability.
- [ ] Preserve job creation file requirements and optional criteria, criteria validation/editing, derived lifecycle/recommendation, score-all, candidate routes, closure selection/history, and closed-job archive behavior.
- [ ] Preserve Admin-and-closed-only permanent deletion plus exact-title confirmation and server-provided destruction counts.
- [ ] Preserve manual bulk/folder resume upload status/progress/duplicate/error states and Outlook connect/search/process/disconnect workflow.
- [ ] Preserve AI feature-flag states, current-job context precedence, agent setup/result/error/retry flows, and ranking/comparison/screening return paths.
- [ ] Preserve standard/minimal workspace modes, theme preferences, rail/menu/command-palette keyboard paths, focus restoration in overlays, reduced motion, and responsive table/list fallbacks.
- [ ] Preserve loading, empty, error, disabled, status-badge, toast, and fallback states documented above; do not replace them with unverified silent states.

## 11. Factual redundancy/complexity observations

- The same candidate action definitions are intentionally rendered in cards, table rows, quick look, and action sheets; one shared `getCandidateActions` limits behavioral drift.
- Candidate browsing has both a global optional job query filter and a canonical job-route scope; source documents the latter as authoritative because route scope cannot be overridden.
- Closing/deleting a job can originate in JobsList and JobDetails but use the same dialog contracts/endpoints.
- Ranking/comparison selection logic appears in browser, ranking result table, and comparison page because each owns a different starting dataset; constraints are documented in all three.
- The UI carries two navigation compositions (standard/minimal) plus AI feature-flag compositions.
- `ImportCandidates` is a self-contained legacy-style large page with separate manual and Outlook state machines rather than shared UI primitives.

## 12. Items requiring runtime verification

1. Authentication cookie/CORS/proxy behavior and every API response field/fallback with real data.
2. OAuth redirect, mailbox folder search, attachment discovery, and processing results.
3. Exact command-palette command set, keyboard focus containment, and active-job command resolution.
4. File-system drag/drop/directory picker behavior across browsers; browser support for `webkitdirectory`.
5. PDF/resume blob preview/download behavior, external LinkedIn/tel/mailto launch behavior.
6. Dark mode contrast, full mobile/tablet layouts, sticky/fixed elements, animated transitions, and reduced-motion results.
7. AI provider response variability, progress timing, structured-data missing states, and feature-flag server enforcement.
8. Error/empty/loading states that depend on real status codes, permissions, malformed data, or interruption mid-mutation.

## 13. UI coverage check

| Measure | Source-audited count |
|---|---:|
| Explicit route declarations | 20 route elements / 21 addressable route behaviors (root/dashboard alias counted separately) |
| Pages discovered and audited | 18 source page modules / 18 |
| Shared component modules discovered | 58 |
| Static `onClick` bindings located | 166 (not a semantic unique-action count) |
| Forms | 6 native `<form>` declarations plus overlay forms |
| Tables | 6 `<table>` declarations (responsive alternate lists/cards also audited) |
| Drawers/dialog usages located | 11 |
| API-backed UI service families | 10 (auth, dashboard, jobs, candidates, mutations/resumes, uploads, Outlook, AI config/run, deletion/closure) |
| Main sidebar destinations | 7 standard non-AI destinations + 5 AI modes; 6 minimal-mode destinations |

This is a source-level coverage statement, not a claim of runtime completeness.

## Current UI Preservation Contract

The matrix in section 10 is the binding preservation inventory. In particular, a redesign must retain route/deep-link behavior; session and AI availability gates; every server-backed field, mutation, upload, status, filter, pagination, contact, resume and closure/deletion rule; candidate comparison limits; AI context/handoffs; user preferences; responsive representations; and all documented loading, empty, error, disabled and permission-dependent states. No visual replacement authorizes removal of those behaviors.

## Recommended Next Audit Step

Runtime-verify authenticated end-to-end candidate import (one manual file and one Outlook-connected application) through candidate status, job closure, and closed-job permissions; it crosses the highest number of API-backed and conditional UI states.
