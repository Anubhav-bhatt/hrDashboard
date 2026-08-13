# HR Resume Screening Dashboard — Operations & Maintenance Manual

This manual documents operational management, database backup/recovery procedures, logging security rules, health monitoring, and incident response for the **HR Resume Screening Dashboard V2**.

---

## 0. Pre-Deployment Requirements

The API refuses to start in production unless these are set:

| Variable | Requirement |
| --- | --- |
| `JWT_SECRET` | At least 32 characters. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `FRONTEND_URL` | Comma-separated CORS allow list. Without it there is no allow list, so the server will not boot. |

Also confirm before going live:

- `NODE_ENV=production` — this disables the Outlook development fixture mode and suppresses stack traces in API responses.
- `TRUST_PROXY=true` when running behind a reverse proxy, so client IPs resolve for rate limiting and the session cookie is issued as `Secure`.
- At least one recruiter account exists (`npm run seed:user -- email password "Name" ADMIN`).
- Rotate the seeded password away from any value committed to `.env.example` or shared during setup.

### Recruiter account management

```bash
cd backend
npm run seed:user -- recruiter@company.com "StrongPassword123" "Full Name" RECRUITER
```

The command creates the account, or updates the password and role if the email
already exists. To revoke access without deleting history, set `isActive` to
`false` on the user row; existing sessions are rejected on their next request.

---

## 1. Operational Health Monitoring

### Health Endpoints

- **Lightweight Health Check**: `GET /api/health`
  - Returns `200 OK` with system uptime status and timestamp.
  - Used by load balancers and container orchestrators for liveness probes.
  
- **Detailed Service Health Check**: `GET /api/health/details`
  - Executes a lightweight `SELECT 1` query against PostgreSQL via Prisma and reports its latency.
  - Reports process health: `eventLoopDelayMs`, `cpuPercentSinceLastCheck`, `memoryMB`, `uptimeSeconds`, `nodeVersion`.
  - Returns `200 OK` when healthy, or `503 Service Unavailable` when the database is unreachable **or** the event loop is lagging beyond 500 ms.

  ```json
  {
    "success": true,
    "status": "healthy",
    "services": { "api": "UP", "database": "UP" },
    "databaseLatencyMs": 2,
    "process": {
      "uptimeSeconds": 812,
      "eventLoopDelayMs": 1,
      "cpuPercentSinceLastCheck": 3,
      "memoryMB": 81,
      "nodeVersion": "v24.11.1"
    }
  }
  ```

### Interpreting a saturated process

A sustained `eventLoopDelayMs` in the hundreds, together with the process holding
~100% of one CPU core, means something is occupying the JavaScript thread and
requests are queuing behind it. The API may stop answering entirely while this is
happening.

To identify the cause on a live process, capture the JavaScript stack rather than
guessing:

```bash
cd backend
node scratch/attachStack.js <pid>
```

This enables the V8 inspector on the running process, pauses it, and prints the
call stack of the blocked thread. Restarting the process clears the symptom but
loses the evidence, so capture the stack first where practical.

### Alerting recommendations

| Signal | Threshold | Action |
| --- | --- | --- |
| `GET /api/health` non-200 | 2 consecutive failures | Restart the instance |
| `status: "degraded"` with `database: "DOWN"` | 1 occurrence | Check database connectivity and credentials |
| `eventLoopDelayMs` > 500 | sustained 60 s | Capture a stack, then restart |
| `memoryMB` growth | steady climb without plateau | Capture a heap snapshot before restarting |

---

## 2. PostgreSQL Operations & Backup Procedures

### Automatic Backup Verification
1. Ensure automated daily backups are configured in your PostgreSQL provider (e.g. Neon, Supabase, Railway, AWS RDS, Azure Database for PostgreSQL).
2. Retain automated point-in-time backups for at least **30 days**.

### Manual Backup Script (pg_dump)
To perform an immediate manual backup prior to major migrations:

```bash
pg_dump "$DATABASE_URL" -F c -b -v -f "backup_hr_screening_$(date +%Y%m%m_%H%M%S).dump"
```

### Database Restoration Procedure
In the event of database failure or corrupted records:
1. Stop backend application writes (`docker stop hr-backend` or disable app traffic).
2. Restore latest verified database backup:
   ```bash
   pg_restore --clean --no-owner --dbname="$DATABASE_URL" "backup_hr_screening_YYYYMMDD_HHMMSS.dump"
   ```
3. Run Prisma validation and client generation:
   ```bash
   npx prisma validate
   npx prisma generate
   ```
4. Verify backend health endpoint: `curl http://localhost:5000/api/health/details`.
5. Resume application traffic.

---

## 3. Safe Database Migration Deployment

> [!CAUTION]
> **Never run `npx prisma migrate reset` or `npx prisma db push --accept-data-loss` in production environments.**

### Pre-Deployment Check
```bash
cd backend
npx prisma validate
npx prisma generate
```

### Production Migration Deployment
```bash
npx prisma migrate deploy
```

---

## 4. Operational Maintenance Routines

### Daily Routine (5 Minutes)
1. Verify `/api/health/details` returns `200 OK` (`status: "healthy"`).
2. Check backend error logs for unexpected 5xx HTTP response spikes.
3. Confirm Microsoft Outlook connection status (`GET /api/outlook/status`).

### Weekly Routine (15 Minutes)
1. Review PostgreSQL database storage growth.
2. Review failed resume parsing count and failure reasons (`SCANNED_DOCUMENT_UNSUPPORTED`, `UNSUPPORTED_FORMAT`).
3. Verify automated database backup execution.
4. Perform an end-to-end smoke test (Create Job -> Parse sample resume -> Verify Candidate score).

### Monthly Routine (30 Minutes)
1. Check Microsoft Entra Client Secret expiration date.
2. Run dependency vulnerability audit (`npm audit`).
3. Review candidate database indexes and query performance.

---

## 5. Microsoft Entra Client Secret Renewal Checklist

1. Sign in to **Microsoft Entra Admin Center** (`https://entra.microsoft.com`).
2. Navigate to **App Registrations** -> Select **HR Resume Screening App**.
3. Select **Certificates & secrets** -> **New client secret**.
4. Set description and expiration period (e.g., 12 or 24 months).
5. Copy the **Value** immediately.
6. Update `MICROSOFT_CLIENT_SECRET` in production backend `.env`.
7. Restart the backend service.
8. Verify Microsoft Outlook login by clicking **"Connect Outlook"** in the dashboard.

---

## 6. Incident Response & Rollback Procedures

### High-Priority Incident Definitions
- **P1**: Application unavailable or PostgreSQL connection failed.
- **P2**: Microsoft Outlook OAuth authentication broken across all users.
- **P3**: Candidate batch imports timing out or failing repeatedly.

### Rollback Workflow
1. Revert backend container image / Git commit to previous stable release tag (e.g., `v1.0.0`).
2. Deploy stable frontend build artifact (`dist/`).
3. If database schema was modified, apply backwards-compatible migration patch.
4. Execute `curl http://localhost:5000/api/health/details` to confirm recovery.
