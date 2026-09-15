# Upload Pipeline Debug and Current-Build Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify and fix the proven upload/import failures, then certify all supported ingestion paths and the current recruiter product without changing scoring, AI architecture, lifecycle rules, or UI design.

**Architecture:** Reproduce through the real React UI and Express API against an isolated local PostgreSQL database. Trace each failure from browser state through multipart parsing, candidate processing, deterministic scoring, Prisma persistence, response mapping, and rendering; add focused API/browser regression coverage before applying the smallest production fixes.

**Tech Stack:** React 18, Vite 6, Axios, Playwright, Node.js, Express, Multer memory storage, Prisma 5, PostgreSQL, `pdf-parse`, and `mammoth`.

**Spec:** `/Users/anubhav/.codex/attachments/f4e43a11-375d-4132-ac13-081448c933f8/pasted-text.txt`

## Global Constraints

- Work only on `feature/ai-recruitment`; preserve the existing package-lock edits and do not modify `hrdashboard.md`.
- Do not reset, clean, stash, rebase, switch branches destructively, push, weaken validation, raise limits blindly, swallow errors, or expose secrets/PII.
- Use an isolated local PostgreSQL database and synthetic documents only.
- Do not change Match Score weights, recruitment lifecycle behavior, AI/OpenRouter architecture, storage technology, or visual design.
- No production fix before reproduction, boundary tracing, a single root-cause hypothesis, and a failing regression test.
- Keep external AI provider calls at zero during parsing and deterministic scoring.

---

### Task 1: Establish an isolated reproducible runtime

**Files:**
- Reference: `backend/.env.example`
- Reference: `frontend/.env.example`
- Reference: `backend/prisma/schema.prisma`
- Create only if needed: `/tmp/hr-upload-debug-*` synthetic fixture files

**Interfaces:**
- Consumes: local PostgreSQL on port 5432 and existing seeded test credentials.
- Produces: backend on `http://127.0.0.1:5001`, frontend on `http://127.0.0.1:5173`, and an isolated `hr_screening_upload_debug` database.

- [ ] Verify branch, HEAD, worktree, recent commits, and masked configuration exactly as Stage 0 requires.
- [ ] Create `hr_screening_upload_debug` only if absent and apply `DATABASE_URL=postgresql://anubhav@127.0.0.1:5432/hr_screening_upload_debug?schema=public npx prisma db push`.
- [ ] Seed a synthetic administrator using environment-only credentials; do not print its password.
- [ ] Start backend and frontend with the isolated database and capture both complete startup logs.
- [ ] Verify `/api/health/details`, `/login`, authentication, and zero pre-existing jobs/candidates.

### Task 2: Map every ingestion and retrieval flow

**Files:**
- Reference: `frontend/src/pages/CreateJob.jsx`
- Reference: `frontend/src/pages/ImportCandidates.jsx`
- Reference: `frontend/src/services/api.js`
- Reference: `backend/routes/jobRoutes.js`
- Reference: `backend/routes/candidateRoutes.js`
- Reference: `backend/routes/outlookRoutes.js`
- Reference: `backend/middleware/upload.js`
- Reference: `backend/middleware/jobLifecycle.js`
- Reference: `backend/controllers/jobController.js`
- Reference: `backend/controllers/candidateController.js`
- Reference: `backend/controllers/outlookController.js`
- Reference: `backend/services/candidateProcessingService.js`
- Reference: `backend/services/resumeParser.js`
- Reference: `backend/services/jdParser.js`
- Reference: `backend/services/outlookService.js`

**Interfaces:**
- Consumes: current source at starting HEAD.
- Produces: a flow matrix covering JD upload, single/bulk/folder resume upload, Outlook import, re-analysis, persistence, and resume retrieval.

- [ ] Record each frontend entry, form-data key, endpoint, authentication/lifecycle middleware, parser, persistence call, response contract, and UI failure mode.
- [ ] Trace the primary manual flow boundary-by-boundary and record expected/actual types.
- [ ] Compare frontend validation, Multer validation, parser validation, and processing-service validation for extensions, MIME types, file counts, and byte limits.
- [ ] Record the actual duplicate, partial-success, closed-job, invalid-job, unauthenticated, and resume-blob behavior.

### Task 3: Reproduce the user-visible failures in Chromium

**Files:**
- Create: `e2e/upload-pipeline.mjs`
- Create: `e2e/fixtures/valid-resume.pdf`
- Create: `e2e/fixtures/valid-resume.docx`
- Create: `e2e/fixtures/valid-jd.pdf`
- Create: `e2e/fixtures/valid-jd.docx`

**Interfaces:**
- Consumes: `E2E_BASE_URL`, `E2E_API_URL`, `E2E_EMAIL`, and `E2E_PASSWORD`.
- Produces: deterministic browser/API evidence with console errors, failed requests, response bodies, and database-side assertions.

- [ ] Generate small valid synthetic PDF/DOCX documents containing distinct names, contacts, skills, experience, education, projects, and JD requirements.
- [ ] Add a Playwright harness that records `pageerror`, console warnings/errors, failed requests, and non-2xx API responses.
- [ ] Log in, create a synthetic job through the UI, enter Add Candidates, select a valid resume, and submit through the actual manual UI.
- [ ] Confirm the current failure occurs before any fix and record the page, action, request, status/body, frontend exception, backend exception, and candidate count delta.
- [ ] Create a mock Outlook connection in the isolated database, open the Outlook-connected branch, and confirm whether rendering/clicking Disconnect fails.

### Task 4: Add API-level upload contract regression coverage

**Files:**
- Create: `backend/tests/uploadPipeline.test.js`
- Modify: `backend/tests/runAll.js`

**Interfaces:**
- Consumes: `POST /api/jobs`, `POST /api/jobs/:jobId/candidates/upload`, `POST /api/jobs/:jobId/candidates/bulk-upload`, and `GET /api/jobs/:jobId/candidates/:candidateId/resume`.
- Produces: an isolated test suite whose fixtures and database records use an `upload-debug-` prefix and are removed in `finally`.

- [ ] Add helpers for authenticated multipart requests, synthetic job creation, candidate lookup, and cleanup.
- [ ] Add valid PDF and valid DOCX tests asserting 201/success, profile extraction, score total/breakdown, blob byte equality, job relation, and zero provider invocation.
- [ ] Add 2/5/10-file bulk tests asserting stable per-input result ordering and independent partial success.
- [ ] Add duplicate-content and same-bytes-renamed tests asserting one candidate row.
- [ ] Add empty/corrupt PDF, corrupt DOCX, unsupported extension/MIME, renamed invalid content, special filenames, below-limit, and above-limit tests asserting controlled responses and no orphan rows.
- [ ] Add closed-job, missing/malformed job, unauthenticated, and wrong-field tests asserting 409/404-or-422/401/400 and no parser-side persistence.
- [ ] Run `node tests/uploadPipeline.test.js` and preserve the failing output before production changes.

### Task 5: Fix only proven root causes using red/green cycles

**Files:**
- Modify only the source files named by the reproduction and failed regression assertions.
- Test: `backend/tests/uploadPipeline.test.js`
- Test: `e2e/upload-pipeline.mjs`

**Interfaces:**
- Consumes: exact failing evidence from Tasks 3 and 4.
- Produces: unchanged successful API contracts and controlled `{ success:false, code, message }` failure contracts.

- [ ] Write the internal root-cause record: reproduction, first failing layer, exact exception/status, cause, why it occurs, why tests missed it, smallest fix, and regression test.
- [ ] State one hypothesis and make the smallest test-only or instrumentation change needed to prove it.
- [ ] Apply one production fix for the confirmed primary cause; do not combine unrelated cleanup.
- [ ] Re-run the exact failing test and browser action until green.
- [ ] For a separate Outlook-connected defect, first preserve a failing connected-render/disconnect test, then import and call the existing `disconnectOutlook` service through the smallest handler and re-run both connected and disconnected states.
- [ ] If any attempted fix fails, return to tracing; after three failed fixes stop and reassess architecture.

### Task 6: Certify the upload matrix and UX

**Files:**
- Modify: `e2e/upload-pipeline.mjs`
- Modify: `backend/tests/uploadPipeline.test.js`

**Interfaces:**
- Consumes: fixed runtime and synthetic fixtures.
- Produces: machine-readable PASS/FAIL evidence for all required upload cases.

- [ ] Verify PDF, DOCX, 2/5/10 files, 5/5 success, 4/5 partial success, duplicate-in-batch, folder-relative paths, and deterministic results.
- [ ] Verify empty/corrupt/password-protected or unreadable documents, unsupported formats, MIME/extension disagreement, special filenames, and size boundaries.
- [ ] Verify closed/deleted/malformed jobs, no/invalid auth, interrupted backend, and duplicate clicks.
- [ ] Verify loading/disabled/recovery states, file-level failure details, completion counts, retry path, and sensible focus/error announcements.
- [ ] Verify Outlook disconnected/connected render, disconnect, mocked search/import, duplicate counts, and 3-success/2-failure reporting.
- [ ] Verify persisted candidate fields, score breakdown, blob bytes, resume viewer/download, no orphan rows, and no external provider calls.
- [ ] Check upload UI at 1440x900, 1280x800, 1024x768, 768x1024, 430x932, 390x844, and 375x812 in light/dark themes for overflow or broken controls.
- [ ] Sample `/api/health/details` before/during/after a reasonable bulk request and record memory without denial-of-service-sized input.

### Task 7: Run the complete current-build regression

**Files:**
- Reference: `backend/package.json`
- Reference: `e2e/package.json`
- Reference: `frontend/package.json`

**Interfaces:**
- Consumes: running isolated app and synthetic fixtures.
- Produces: fresh pass/fail totals for every current suite and the production build.

- [ ] Run `npm test` in `backend` and record every suite result, including scoring weights totaling 100.
- [ ] Run `npm run build` in `frontend` and record warnings/errors.
- [ ] Run each script named by `e2e/package.json`, recording the known AI-assistant assertion separately if current evidence confirms it is stale.
- [ ] Run the final browser journey from login through job/JD creation, five resumes, scores, search/filter, profile/resume, shortlist/compare/select/close, closed isolation, dashboard, and logout.
- [ ] Verify Standard/Minimal screens and mode switching preserve context without presentation-only network calls.
- [ ] Inspect browser console and backend logs for uncaught errors, unhandled rejections, Prisma failures, stack leaks, secrets, or resume content.

### Task 8: Final diff audit and incident report

**Files:**
- Reference: every changed file from `git status --short`.
- Do not modify: `hrdashboard.md`

**Interfaces:**
- Consumes: all evidence from Tasks 1–7.
- Produces: the exact required DEBUG STATUS and FINAL VERDICT report.

- [ ] Run `git status`, `git diff`, and `git diff --cached`; review every production/test line for debug logging, secrets, fixture data, disabled validation, or unrelated edits.
- [ ] Confirm business logic, Match Score, AI logic, and feature-removal declarations from the actual diff.
- [ ] Populate the upload flow map, complete upload matrix, JD/Outlook/database/score/UX results, full recruiter E2E, regression table, build/console/log evidence, files changed, blockers, and all 20 YES/NO/NOT VERIFIED answers.
- [ ] Choose `UPLOAD PIPELINE FIXED AND CERTIFIED` only if every non-negotiable final gate has fresh passing evidence; otherwise choose `UPLOAD PIPELINE STILL HAS BLOCKERS`.
- [ ] Choose `UPLOAD SYSTEM VERIFIED — SAFE TO CONTINUE UI DEVELOPMENT` only if the complete release gate is green; otherwise choose `UPLOAD SYSTEM NOT RELIABLE — FIX BEFORE CONTINUING UI DEVELOPMENT`.

