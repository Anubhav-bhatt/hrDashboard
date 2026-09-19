# Workspaces, signup and data isolation

Why public signup needed a tenancy layer, how records are scoped, and the order
the two halves must be deployed in.

---

## 1. What was true before

Every authenticated user could see every job and every candidate. `Job` and
`Candidate` had no owner at all — only `closedByUserId` and `selectedByUserId`,
which record *who did a thing*, not *who the record belongs to*:

```text
CURRENT DATA MODEL (before):  SINGLE SHARED COMPANY
```

That is a reasonable model for one company running one deployment. It is not a
model you can open a public signup form on top of: the first person to register
would have seen every candidate already in the database, including their names,
email addresses, phone numbers and resumes.

So the ownership layer came first, and signup second.

---

## 2. The model

```text
User ──< WorkspaceMember >── Workspace ──< Job ──< Candidate ──< Note / Activity
```

| Model | How it is scoped |
| --- | --- |
| `Job` | `workspaceId` — the single authority |
| `Candidate` | through its job |
| `CandidateNote`, `CandidateActivity` | through their candidate's job |
| `ImportSession` | through its job |
| `OutlookConnection` | `workspaceId` |

**Candidates deliberately have no `workspaceId` of their own.** A denormalised
copy is faster to query and impossible to keep honest: the moment a candidate's
`workspaceId` can disagree with its job's, one of them is a lie and neither is
trustworthy. Reaching the workspace through the job means there is one answer to
"who owns this", always.

`WorkspaceMember.role` (OWNER/MEMBER) is the workspace role and is separate from
`User.role` (RECRUITER/ADMIN), which stays the application-wide role.

---

## 3. How it is enforced

Three enforcement points, rather than a filter on each of the ~110 query sites:

**1. `requireAuth` resolves the tenant.** It already loaded the user, so the
membership comes along on the same query and `req.workspaceId` is set for every
authenticated request. An account with no membership is refused with
`NO_WORKSPACE` rather than being shown an empty dashboard.

**2. `requireJobInWorkspace` gates everything under `/api/jobs/:jobId`.**
Registered with `router.param`, so every current *and future* route naming a job
id is covered by construction. This is most of the candidate surface — listings,
profiles, resumes, notes, status changes, uploads, analysis, shortlist, closure —
closed at one point rather than three dozen.

It answers **404, not 403**. A 403 would confirm the id names a real job, which
is a membership oracle: try ids, keep the ones that come back 403, and you have
learned another workspace's job list without reading a record.

**3. The collection queries scope themselves**, at the two builders they already
funnel through — `buildJobWhere` and `buildCandidateWhere` — plus the analytics
scope object and the mailbox lookups.

### Everything fails closed

`jobScope(null)` returns a clause that matches nothing, not a clause that matches
everything:

```js
const jobScope = (workspaceId) =>
  workspaceId ? { workspaceId } : { workspaceId: '__no_workspace__' };
```

A caller who forgets the tenant gets an empty list. This is not theoretical — it
caught a real omission during development, where `GET /jobs/:id` was left without
a workspace and the owner's own job came back 404. Had the default been "no
filter", that same omission would have silently served every workspace's jobs and
the tests would have passed.

---

## 4. Signup

`POST /api/auth/signup` takes a name, an email and a password. Nothing else.

One transaction creates the account, its workspace, the membership and the
refresh session; the cookies are written only after it commits. A half-made
account that can authenticate but owns no workspace would sign in successfully
and then be refused by every scoped query, which reads as a broken product.

- **`role` is never read from the request.** A public form is not a place to
  choose your own permissions. New accounts are `RECRUITER` — the least
  privileged ordinary role — and OWNER of their own workspace.
- **Auto-login.** The server sets the same cookies as sign-in, so there is no
  bounce back to the login screen.
- **Duplicate email** returns 409 `EMAIL_IN_USE`. Sign-in deliberately hides
  whether an account exists; signup cannot, or the person cannot proceed. Nothing
  beyond that one fact is revealed.
- **Password policy** is a length floor (10) plus a check that it is not an
  obvious password or a rearrangement of the email address. Character-class
  checklists push people towards `Password1!` and reuse.
- **Rate limit** `SIGNUP_RATE_LIMIT`, default 10/hour/address.

---

## 5. The existing data

The migration `20260919120000_add_workspaces` creates one workspace,
**"Existing Recruitment Workspace"** (`00000000-0000-4000-8000-000000000001`),
and:

- attaches **every account that existed before** to it as OWNER — recording the
  access they already had, not granting anything new;
- backfills **every existing job** into it.

Public signups never join it. A new account gets its own empty workspace.

Prisma's generated DDL would have added `workspaceId ... NOT NULL` in one step,
which fails on a populated table. The migration does it in the three steps a
populated table needs — add nullable, backfill, then constrain — so the 36 jobs
and 319 candidates in the development database were preserved rather than
dropped.

---

## 6. Deployment order

The frontend's signup page calls an endpoint that only exists after the backend
ships, and the backend's scoping needs the tables the migration creates.

```text
1. Migration        npx prisma migrate deploy
2. Backend          (includes the exact CORS allowlist — see below)
3. Verify           POST /api/auth/signup with no body  → 400, not 404
                    GET  /api/auth/refresh              → 401, not 404
4. Frontend         (vercel.json rewrite + signup page)
5. Verify in a browser, Safari included
```

Steps 1–3 are backwards-compatible with the currently deployed frontend, so they
can sit in production on their own for as long as needed. The reverse is not
true.

> **The CORS fix is not optional and should not wait.** The live backend still
> reflects arbitrary origins with credentials — any `*.vercel.app` deployment and
> any hostname merely *containing* `localhost` is currently allowed. See
> [AUTHENTICATION.md](AUTHENTICATION.md). Shipping signup while that is live
> would open a shared database to the public *and* leave it readable
> cross-origin.

### Everyone signs in once

The old `hr_session` cookie is deliberately not honoured. Existing recruiters
sign in once after the backend deploys, and land in the inherited workspace with
all of their jobs and candidates.

---

## 7. Known gaps

Chosen, not overlooked.

- **Deleting a job requires `ADMIN`**, and signups are `RECRUITER`, so a
  workspace owner cannot yet delete their own closed job. Everything else in the
  hiring cycle — create, import, review, shortlist, compare, select, close —
  works. Making workspace OWNER sufficient for destructive actions inside their
  own workspace is the natural follow-up.
- **One workspace per person.** The schema supports many (`WorkspaceMember` is a
  join table with a composite key); the product exposes the oldest membership.
  No screen invites anyone, so there is nothing yet to switch between.
- **No workspace switcher, no invitations, no seat management.** Out of scope
  until a second member can exist.
- **`OutlookConnection.microsoftUserId` stays globally unique.** Connecting the
  same Microsoft account to a second workspace moves it rather than duplicating
  it. Not a leak — each workspace only ever reads its own connection — but the
  first workspace loses the connection and is not told.
- **A password change does not revoke sessions**, and there is no
  "sign out everywhere". Both noted in [AUTHENTICATION.md](AUTHENTICATION.md).

---

## 8. Testing

```bash
cd backend && npm run test:isolation   # 30 probes: listings, id guessing,
                                       # writes, aggregates, mailbox, AI tools
cd e2e && npm run test:auth:matrix     # signup + session, chromium/firefox/webkit
```

The isolation suite asserts the **negative** — that nothing of the other
workspace is reachable — and ends with a positive control asserting the owner can
still see their own records. Without that control, a suite could pass by scoping
everything to nothing.
