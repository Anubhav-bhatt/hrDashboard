# HR Resume Screening Dashboard (PostgreSQL & Prisma ORM V2)

A production-grade full-stack recruitment dashboard for HR teams: recruitment job
management, Microsoft Outlook import, resume parsing into structured candidate
profiles, and deterministic job relevance scoring backed by **PostgreSQL** and
**Prisma ORM**.

Candidate records contain personal data, so **every data endpoint and every
screen requires an authenticated recruiter session**.

---

## Technical Stack & Architecture

- **Frontend**: React 18 (Vite 6, JavaScript, Tailwind CSS 3, Lucide Icons, React Router 6, Axios)
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma ORM (`@prisma/client`, `prisma`)
- **Authentication**: JSON Web Tokens in an httpOnly, SameSite=Lax cookie; bcrypt password hashing
- **Outlook Integration**: Microsoft Identity Platform, Microsoft Graph API (`@azure/msal-node`)
- **Resume Parsing**: PDF (`pdf-parse`), DOCX (`mammoth`), TXT — parsed in memory
- **AI Integration**: 100% Optional (Deterministic scoring operates without external API keys)
- **Testing**: dependency-free Node assertion suites (unit + API integration), Playwright-driven end-to-end and accessibility suites

```text
                 React Frontend
                       │
                       ▼
                 Node + Express
                       │
             ┌─────────┴──────────┐
             │                    │
             ▼                    ▼
       PostgreSQL          Microsoft Graph
             │                    │
          Prisma               Outlook
             │                    │
             │             Candidate Emails
             │                    │
             │             Resume Buffer
             │                    │
             │             Resume Parser
             │                    │
             └─────────┬──────────┘
                       ▼
              Candidate Extractor
                       │
                       ▼
                Matching Engine
                       │
                       ▼
             PostgreSQL (Prisma)
                       │
                       ▼
                 HR Dashboard
```

---

## Technical Features

### Phase 1: Recruitment Job Management & JD Parsing
- Create recruitment jobs with title and Job Description (JD) document.
- In-memory file processing using `multer.memoryStorage()` for PDF, DOCX, and TXT files up to 5 MB.
- Extracted text and structured JD requirements (`requiredSkills`, `preferredSkills`, `minimumExperience`, `preferredEducation`, `roleKeywords`) stored in PostgreSQL via Prisma.

### Phase 2: Microsoft Outlook Integration & Mailbox Traversal
- Secure Microsoft OAuth 2.0 PKCE / Authorization Code grant authentication (`@azure/msal-node`).
- Folder discovery and traversal using Microsoft Graph folder IDs (e.g., `Inbox`, `Naukri`, `Recruitment`).
- Date-range email retrieval with 23:59:59.999 day-boundary normalization and pagination support up to `MAX_EMAIL_IMPORT` (default 2000).
- Automatic identification of PDF and DOCX candidate resume attachments while ignoring inline images, logos, and signature assets.
- Direct retrieval of attachment bytes into Node.js `Buffer` objects strictly in RAM without local disk persistence.
- Graceful development mock mode if Microsoft credentials are not configured.

### Phase 3: In-Memory Resume Parsing & Structured Candidate Profiles
- Text extraction from PDF, DOCX, and TXT buffers directly from memory.
- Deterministic candidate profile extraction (Name, Email, Phone, Experience, Skills, Education, Projects).
- Relational compound unique constraint (`@@unique([jobId, outlookMessageId, outlookAttachmentId])`) preventing duplicate attachment imports.

### Phase 4: Deterministic 0–100 Job Relevance Scoring
- Skill alias normalization (`ReactJS`/`React.js` -> `React`, `NodeJS` -> `Node.js`, `RESTful API` -> `REST API`, `Postgres` -> `PostgreSQL`).
- 100-Point Weighted Scoring Model:
  - Required Skills: **40 pts**
  - Experience: **25 pts**
  - Role Relevance: **15 pts**
  - Preferred Skills: **10 pts**
  - Projects: **5 pts**
  - Education: **5 pts**
- Alignment classification (90%+ Excellent, 80-89% Strong, 70-79% Good, 60-69% Partial, <60% Low).
- Sensitive attribute exclusion (Age, Gender, Religion, Photo, Race, Marital Status are strictly excluded). No automated hiring/rejection decisions.

### Phase 5: Ranked Candidate Dashboard & HR Review Workflow
- Candidate search across name, email, phone, current role, headline, location, qualification, skills and matched keywords — all case-insensitive.
- Filters for score band, experience range, skill (repeatable, AND-combined), location, qualification, status (single or multiple) and application date. Filters combine correctly; each condition is an independent clause.
- Server-side sorting and pagination with a `pagination` envelope (`page`, `limit`, `total`, `totalPages`, `hasNextPage`, `hasPreviousPage`).
- Human HR review statuses (`REVIEW`, `SHORTLISTED`, `NOT_SUITABLE`, `NEEDS_REVIEW`), threaded recruiter notes, and an append-only activity trail.
- Original resume documents are retained and streamed on demand; Outlook-sourced resumes are re-fetched live from Graph.

### Authentication & Access Control
- Recruiter accounts (`User` model) with bcrypt-hashed passwords and `ADMIN` / `RECRUITER` roles.
- Sign-in issues a short-lived JWT in an **httpOnly** cookie, so no token is reachable from page scripts.
- Sign-in responses are identical for an unknown email and a wrong password, and both paths spend the same verification cost, so the endpoint cannot be used to enumerate accounts.
- Rate limits on sign-in (20 per 10 minutes) and on the API as a whole (600 per minute).
- Every `/api/jobs`, `/api/candidates`, `/api/analytics` and `/api/outlook` route requires a valid session.
- Candidate mutations are scoped by job, so a mismatched job ID in a URL cannot read or modify another job's candidate.

### Structured Candidate Profiles
Resume text is parsed into the sections a recruiter actually reads, stored on the
candidate as `parsedProfile`:

- contact details (primary and alternate email/phone), LinkedIn, GitHub, portfolio
- professional summary or career objective, verbatim
- work history with title, employer, location, dates, duration and highlights
- education with degree, specialisation, institution, years and grade
- projects, certifications (issuer, date, credential ID), languages, achievements

A field the resume does not contain is stored as `null` and rendered as
"Not provided". Nothing is inferred or invented.

### Dashboard & Analytics
- `GET /api/analytics/overview` returns live KPI metrics, the hiring pipeline, score-band distribution, a 14-day application trend, and recent candidates and jobs.
- Every dashboard metric card is a single full-surface link into the matching filtered candidate list.

---

## PostgreSQL Database Schema (Prisma)

The authoritative schema is `backend/prisma/schema.prisma`. Models:

| Model | Purpose |
| --- | --- |
| `User` | Recruiter accounts: email, bcrypt password hash, name, role (`ADMIN` / `RECRUITER`), active flag, last sign-in |
| `Job` | Recruitment job: title, uploaded JD metadata and text, and the screening criteria that drive scoring (required and preferred skills, keywords, experience band, salary band, locations, qualifications) |
| `Candidate` | Candidate profile, contact details and web presence, skills, the structured `parsedProfile` JSON, the original resume bytes, the full score breakdown, HR status and notes |
| `CandidateNote` | Timestamped recruiter notes, attributed to their author |
| `CandidateActivity` | Append-only recruitment trail: `IMPORTED`, `STATUS_CHANGED`, `NOTE_ADDED`, `ANALYZED`, `RESUME_VIEWED` |
| `OutlookConnection` | Connected mailbox and its OAuth tokens |
| `ImportSession` | Record of each mailbox scan: folder, date range and counts |

Duplicate protection on `Candidate` uses two compound unique constraints:
`(jobId, outlookMessageId, outlookAttachmentId)` for mailbox imports, and
`(jobId, resumeHash)` for identical file content. Deleting a job cascades to its
candidates, notes and activity.

Fields added in V2, all nullable so existing records remain valid:

- Contact and links: `alternateEmail`, `alternatePhone`, `linkedinUrl`, `githubUrl`, `portfolioUrl`
- Professional text: `headline`, `summary`
- Structured sections: `parsedProfile` (JSON)
- Resume retention: `resumeData` (bytes), `resumeSize`

To apply schema changes:

```bash
cd backend
npx prisma db push
npx prisma generate   # stop the running server first — it holds the query engine open
```

---

## Installation & Local Setup

### 1. Database Setup (PostgreSQL)

Set up a local PostgreSQL database or run via Docker:

```bash
docker run \
  --name hr-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=hr_screening \
  -p 5432:5432 \
  -d postgres
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `.env` before the first start:

```bash
# Required: signing secret for session tokens (minimum 32 characters)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set `JWT_SECRET` to that value, then set `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` so the first recruiter account can be created. Then:

```bash
npx prisma db push
npm start
```

The backend starts on `http://localhost:5000` and creates the seed recruiter
account if the users table is empty.

To add more recruiter accounts at any time:

```bash
npm run seed:user -- recruiter@company.com "StrongPassword123" "Full Name" RECRUITER
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on `http://localhost:5173`. Sign in with the seeded account.

### 4. Running Automated Tests

Backend unit and API integration suites:

```bash
cd backend
npm test              # every suite
npm run test:unit     # parsing, query building, serialisation — no database needed
npm run test:api      # API integration against the configured database
```

End-to-end and accessibility suites (require both servers running):

```bash
cd e2e
npm install
E2E_EMAIL=recruiter@company.com E2E_PASSWORD=... npm test
E2E_EMAIL=recruiter@company.com E2E_PASSWORD=... node accessibility.mjs
```

The end-to-end suite drives a real browser and fails the run on console errors,
uncaught exceptions or unexpected failed requests.

### 5. Validating Resume Parsing Against Your Own Documents

```bash
cd backend
node scratch/validateParsing.js "C:/path/to/resumes"
```

Reports which fields were recovered from each document. Values are masked, so it
is safe to run against real candidate files.

---

## Required Environment Variables

### Backend (`backend/.env`)

See `backend/.env.example` for the complete, commented list. The settings that
matter most:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma |
| `JWT_SECRET` | Session-token signing secret, minimum 32 characters. **The server refuses to start in production without it.** |
| `SESSION_TTL_HOURS` | Session lifetime (default 12) |
| `FRONTEND_URL` | Comma-separated CORS allow list. **Required in production**; arbitrary origins are never reflected. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Creates the first recruiter account when the users table is empty |
| `API_RATE_LIMIT` / `LOGIN_RATE_LIMIT` | Request throttles (default 600/min and 20/10min) |
| `TRUST_PROXY` | Set to `true` behind a reverse proxy so client IPs and secure cookies resolve correctly |
| `STORE_RESUME_BLOB` | Retain original resume bytes so recruiters can open the real document (default `true`) |
| `MAX_RESUME_SIZE_MB` / `MAX_BULK_RESUME_FILES` | Upload limits |
| `MICROSOFT_*` | Optional Outlook OAuth credentials — resume upload works without them |

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:5000/api
```

---

## API Reference

All routes are prefixed with `/api`. Every route except the health checks and
`POST /auth/login` requires an authenticated session.

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/health` | Liveness probe | No |
| GET | `/health/details` | Database connectivity plus event-loop delay, CPU and memory | No |
| POST | `/auth/login` | Sign in, sets the session cookie | No |
| GET | `/auth/me` | Current recruiter | Yes |
| POST | `/auth/logout` | Clear the session | No (idempotent) |
| GET | `/analytics/overview` | KPI metrics, pipeline, score bands, trend, recent activity | Yes |
| GET | `/candidates` | Cross-job candidate list with filters, sorting, pagination, status facets | Yes |
| GET | `/candidates/filters` | Distinct skills, locations and qualifications present in the data | Yes |
| GET | `/candidates/:candidateId` | Full structured candidate profile | Yes |
| GET | `/jobs` | Job list with candidate counts and computed status | Yes |
| POST | `/jobs` | Create a job from an uploaded job description | Yes |
| GET | `/jobs/:id` | Job detail, requirements and score tiers | Yes |
| PATCH | `/jobs/:id/search-criteria` | Update screening criteria | Yes |
| POST | `/jobs/:jobId/outlook/search` | Find candidate applications in a mail folder | Yes |
| GET | `/jobs/:jobId/candidates` | Candidates for one job (same filters and pagination) | Yes |
| GET | `/jobs/:jobId/candidates/:candidateId` | Job-scoped candidate profile | Yes |
| POST | `/jobs/:jobId/candidates/upload` | Upload and score one resume | Yes |
| POST | `/jobs/:jobId/candidates/bulk-upload` | Upload and score many resumes | Yes |
| POST | `/jobs/:jobId/candidates/process` | Import discovered Outlook applications | Yes |
| POST | `/jobs/:jobId/candidates/analyze-all` | Re-score every candidate on a job | Yes |
| POST | `/jobs/:jobId/candidates/:candidateId/analyze` | Re-score one candidate | Yes |
| PATCH | `/jobs/:jobId/candidates/:candidateId/status` | Change HR review status | Yes |
| PATCH | `/jobs/:jobId/candidates/:candidateId/notes` | Replace the screening summary note | Yes |
| POST | `/jobs/:jobId/candidates/:candidateId/notes` | Append a timestamped note | Yes |
| GET | `/jobs/:jobId/candidates/:candidateId/resume` | Stream the original resume (`?download=1` to save) | Yes |
| GET | `/outlook/status`, `/outlook/folders`, `/outlook/connect`, `/outlook/callback`, `/outlook/disconnect` | Mailbox connection management | Yes |

Successful list responses use `{ success, data, pagination }`; errors use
`{ success: false, code, message }`.

---

## Security & Deployment Principles

1. **Authenticated access only**: candidate data is unreachable without a valid recruiter session. Signing out immediately stops any candidate data from rendering.
2. **Session hardening**: tokens live in httpOnly, SameSite=Lax cookies (Secure in production), never in `localStorage`.
3. **Explicit CORS allow list**: origins come from `FRONTEND_URL`. Arbitrary origins are never reflected, which matters because requests carry credentials.
4. **Job-scoped candidate access**: reads and mutations verify the candidate belongs to the job in the URL.
5. **No fabricated candidate data**: the resume endpoint serves the real document or returns `404` with an explanation. It never substitutes placeholder content, and the Outlook fixture mode is disabled entirely when `NODE_ENV=production`.
6. **Safe error responses**: Prisma internals, stack traces and file paths are never returned to a client; stack traces are development-only.
7. **Untrusted content is rendered as text**: resume text and recruiter notes are never injected as HTML. Parsed URLs are validated and only `http(s)` links are made clickable. The PDF preview iframe is fully sandboxed.
8. **Minimal logging**: logs record identifiers and masked emails. Resume contents, full contact details and tokens are never logged.
9. **Rate limiting** on sign-in and on the API surface.
10. **Cascading relational integrity**: deleting a job cleans up its candidates, notes and activity (`onDelete: Cascade`).
11. **No automated decisions**: match scores are explainable decision-support signals. Every hiring decision stays with a human recruiter.

### A note on resume storage

The V1 design processed resumes strictly in memory and never retained the file.
That made "View Original Resume" impossible to satisfy honestly for directly
uploaded candidates — the endpoint returned generated placeholder text instead of
the candidate's document. Original bytes are now retained in PostgreSQL
(`Candidate.resumeData`) so recruiters can open and download the real file. Set
`STORE_RESUME_BLOB=false` to keep the original in-memory-only behaviour; the
resume viewer then reports that the document is unavailable and offers the
extracted text instead.
