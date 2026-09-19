# Authentication architecture

How a recruiter stays signed in, why the browser talks to `/api` instead of the
API's own hostname, and the order in which the two halves must be deployed.

---

## 1. Why the browser calls `/api`

The frontend is served from Vercel and the API runs on Render. Those are
different registrable domains, so a cookie set by the API was a **third-party**
cookie from the browser's point of view.

Safari and every other WebKit browser refuse to store third-party cookies
outright. The failure was quiet and looked nothing like a cookie problem:

```
POST /api/auth/login   → 200, Set-Cookie received
GET  /api/auth/me      → 401         (the cookie was never stored)
→ back to the sign-in screen
```

The fix is to stop making cross-site requests at all. `frontend/vercel.json`
rewrites `/api/*` to the Render backend **server-side**, so the browser only ever
talks to the origin it loaded the page from:

```
Browser → https://hr-dashboard-v9wq.vercel.app/api/...
                     │  (Vercel rewrite, server-side)
                     ▼
          https://hrdashboard-g25k.onrender.com/api/...
```

The cookies are now first-party, which is what makes them storable. That is also
why `COOKIE_SAME_SITE` should stay at `lax`: `none` marks a cookie cross-site
and reintroduces exactly the behaviour this removes.

> **Order matters in `vercel.json`.** The SPA catch-all (`/(.*)` → `/index.html`)
> must come *after* the `/api` rewrite. With the catch-all first, `/api/health`
> returns the HTML shell with status 200 — which is what production did before
> this change, and it is a confusing thing to debug.

---

## 2. Two tokens

| | Access | Refresh |
| --- | --- | --- |
| Cookie | `hr_access` | `hr_refresh` |
| Form | signed JWT | opaque random (48 bytes) |
| Lifetime | `ACCESS_TOKEN_TTL_MINUTES` (15) | `REFRESH_TOKEN_TTL_DAYS` (14) |
| Path | `/` | `/api/auth` |
| Server state | none | `AuthSession` row |
| Revocable | no | yes |

Every access token carries `typ: "access"`, checked on verification, so neither
token can be presented in the other's place.

The refresh token is stored only as a **SHA-256 digest**. A fast hash is correct
here and bcrypt is not: the token is 384 bits of machine-generated entropy, so
there is no dictionary to slow down, and a deterministic digest is what makes the
lookup a single indexed query.

### Rotation

A refresh token is redeemable exactly once. Redeeming it revokes the row and
mints a replacement in the same `familyId`, keeping the spent row so a replay can
be recognised rather than merely being unknown.

Replaying a spent token revokes **the whole family**, not just that token — once
two parties hold tokens from one lineage, the server cannot tell which one is the
recruiter, so neither keeps the session.

Rotation is race-safe by construction: the revoke is an `UPDATE ... WHERE
revokedAt IS NULL`, so of two simultaneous requests exactly one sees a row
updated.

### The grace window

`REFRESH_REUSE_GRACE_SECONDS` (default 15) is the window in which re-presenting a
just-rotated token is treated as two browser tabs racing rather than a theft. The
request converges on the live head of the family instead of revoking it.

Without it, strict single-use would sign a recruiter out for having two tabs
open.

> Setting it to `0` gives strict single-use, and the cost is real rather than
> theoretical: a burst of genuinely concurrent refreshes is indistinguishable
> from a replay, so it revokes the family and signs the recruiter out. The test
> suite demonstrates this. Only choose `0` if a stolen-token window of a few
> seconds matters more than occasional spurious sign-outs.

When a request loses the rotation race it does **not** rotate again — it cannot,
having only ever seen the digest of the winner's token. It confirms the family
still has a live head and mints a fresh access token, which is all its caller
needed; the winner has already written the new refresh cookie to the jar both
tabs share. So one rotation happens per spent token however many requests arrive
together, and no request is told to sign in while the session is good.

A losing request also never clears the cookies. Tabs share one jar, so clearing
there would wipe the pair the winner had just set — a logout race caused
entirely by the logout handling itself.

---

## 3. The browser side

`frontend/src/services/api.js` holds a single-flight refresh coordinator. A
dashboard screen fires several requests at once, so an expired access token
arrives as a handful of simultaneous 401s. Each starting its own refresh would
mean the first rotates the token and the rest replay it — the session would be
revoked by the act of loading a page. One shared promise prevents that; the
browser suite asserts the refresh count is exactly 1.

Retries are bounded by a flag on the request itself, and the refresh call is made
with a bare axios instance so it cannot re-enter the interceptor. A failed
refresh therefore ends in a sign-in screen, never a loop.

| Response | Client behaviour |
| --- | --- |
| 401 `SESSION_EXPIRED` | one refresh, then retry |
| 401 `AUTH_REQUIRED` | one refresh, then retry |
| 401 `INVALID_SESSION` | one refresh, then retry |
| 403 `FORBIDDEN` | nothing — no token will change an authorization answer |

`INVALID_SESSION` is renewable because it describes the *access token*, not the
session: after a signing-secret rotation every access token looks invalid while
the refresh token is still perfectly good. Attempting is also what gets stale
cookies cleared — a failed refresh is answered with cookie-clearing headers.

---

## 4. Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `ACCESS_TOKEN_SECRET` | falls back to `JWT_SECRET` | ≥32 chars; production refuses to start otherwise |
| `ACCESS_TOKEN_TTL_MINUTES` | `15` | Values below ~0.017 mint an already-expired token: a JWT `exp` is whole seconds |
| `REFRESH_TOKEN_TTL_DAYS` | `14` | How long before a password is required again |
| `REFRESH_REUSE_GRACE_SECONDS` | `15` | `0` for strict single-use |
| `REFRESH_RATE_LIMIT` | `300` | Per 10 minutes per address |
| `COOKIE_SAME_SITE` | `lax` | Leave it alone; `none` is what broke Safari |
| `FRONTEND_URL` | — | Exact origins, comma-separated. Required in production |

`SESSION_TTL_HOURS` is no longer read; `REFRESH_TOKEN_TTL_DAYS` replaces it.

### The 14-day default

No business requirement for session length was recorded anywhere in this
repository, so 14 days is a **stated default, not a discovered one**: a recruiter
working a hiring cycle signs in about once a fortnight rather than twice a day,
and a fortnight is short enough that a device quietly leaving the company's hands
stops working within one pay cycle. Change it if the business says otherwise.

---

## 5. Deployment order

The frontend's silent refresh depends on an endpoint that only exists after the
backend ships. Deploy in this order:

1. **Backend + migration.** `npx prisma migrate deploy`, then confirm the app
   boots and `/health` is green.
2. **Verify the refresh API** before touching the frontend:
   ```bash
   curl -i -X POST https://<backend>/api/auth/refresh
   # expect 401 with code AUTH_REQUIRED — the route exists and wants a cookie
   # a 404 means the backend has not actually rolled over yet
   ```
3. **Frontend** (`vercel.json` rewrite + API client).
4. **Verify in a browser**, Safari included.

The backend is backwards-compatible with the currently deployed frontend, so
step 1 can sit in production on its own for as long as needed. The reverse is not
true: a frontend deployed first would call a refresh endpoint that returns 404
and sign recruiters out when their access token first expires.

### Everyone is signed out once

The old `hr_session` cookie is deliberately **not** honoured — accepting it would
mean trusting a 12-hour token minted before purpose claims existed. Recruiters
sign in once after the backend deploys. It is cleared wherever cookies are set or
cleared, so nobody is left carrying a dead cookie.

### Remove `VITE_API_URL` from the Vercel project

If it is left pointing at the Render URL it would reinstate the cross-site
architecture. The client now ignores a cross-origin `VITE_API_URL` in production
builds and warns, but the variable should still be removed or set to `/api`.

---

## 6. The migration

`20260919000000_add_auth_sessions` creates the `AuthSession` table. It is written
with `IF NOT EXISTS` guards throughout, so applying it twice is harmless.

> [!IMPORTANT]
> **The migration history is not complete, and this predates the auth work.**
> The schema was originally created with `prisma db push`, and the one earlier
> migration `ALTER`s tables it never creates. `prisma migrate deploy` therefore
> **cannot build an empty database** — it fails with
> `relation "Candidate" does not exist`.
>
> This is fine for production, which already has those tables. It means:
>
> - **Existing databases:** `npx prisma migrate deploy` works. If
>   `_prisma_migrations` is missing or empty, baseline first so Prisma does not
>   try to replay the earlier migration:
>   ```bash
>   npx prisma migrate resolve --applied 20260814000000_add_job_closure_and_candidate_selection
>   npx prisma migrate deploy
>   ```
> - **Brand-new databases:** bootstrap with `npx prisma db push`, then
>   `migrate resolve --applied` for both migrations.
>
> Worth fixing separately by squashing the current schema into a baseline
> migration. It is out of scope here and carries its own deployment risk.

### Rolling back

The table is additive and nothing else reads it, so the previous backend can be
redeployed without dropping it. Recruiters sign in again; the orphaned rows
expire on their own.

---

## 7. Testing

```bash
cd backend && npm run test:auth      # rotation, replay, concurrency, expiry, CSRF
cd e2e && npm run test:auth:matrix   # chromium + firefox + webkit, same-origin
```

The matrix runner serves the frontend with `VITE_API_URL=/api` and Vite's dev
proxy pointed at the backend, so the page and the API share an origin — the same
shape production has. Running the suite against a cross-origin API would prove
nothing about the bug it exists to catch.

Cookie *attributes* are asserted from the `Set-Cookie` header rather than the
browser's cookie store: WebKit reports `SameSite: None` for every cookie
regardless of what was sent, so reading the store would fail a correct server and
pass a broken one.

---

## 8. Known gaps

Deliberately out of scope, recorded so they are chosen rather than forgotten.

- **An access token outlives a sign-out** by up to its TTL (15 minutes). This is
  the accepted cost of stateless access tokens, and the reason the TTL is
  measured in minutes. Revoking it would need a denylist checked on every
  request, reintroducing the per-request database read the split exists to avoid.
- **No "sign out everywhere".** The schema supports it —
  `revokeMany({ userId })` — but no screen asks for it.
- **A password change does not invalidate existing sessions.** There is no
  password-change screen yet; whoever builds one should revoke that user's
  sessions in the same transaction.
- **Deactivating a user is already effective**, on the next request: both
  `requireAuth` and refresh check `isActive`, and refresh revokes the family.
- **Rate limits are per-address.** An office behind one NAT address shares a
  counter. The budgets are sized for that, but a very large office on one address
  may need them raised.
- **Expired session rows are never pruned.** They are small, but a periodic
  `DELETE FROM "AuthSession" WHERE "expiresAt" < now() - interval '30 days'`
  would keep the table tidy.
