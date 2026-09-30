# Closed Job Permanent Deletion — Architecture & Verification Report

**Platform:** HR Resume Screening & AI Recruitment Platform  
**Date:** September 30, 2026  
**Status:** Complete & Fully Validated

---

## Closed Job Permanent Deletion

Available only for CLOSED jobs:
**YES**

Authorization:
**ADMIN / SUPER_ADMIN (Workspace membership verified)**

Workspace isolation:
**PASS**

Confirmation:
**PASS (Case-insensitive trimmed title match required)**

Transaction:
**PASS (Prisma interactive transaction with 30s timeout)**

---

## Deleted Data

| Data | Delete / Preserve | Reason |
|---|---|---|
| Job | **DELETE** | Root entity selected for permanent deletion. Unsets circular `selectedCandidateId` prior to deletion. |
| Candidate association | **DELETE** | Candidate records in this platform are job-scoped (`Candidate.jobId`). |
| Candidate | **DELETE** | Pure child entity of the deleted job. |
| Match scores | **DELETE** | Stored inside `Candidate` model (`score`, `breakdown`, `fitLabel`). Deleted with candidates. |
| Screening data | **DELETE** | Job-specific screening criteria, parsed details, and summary. Deleted with candidate rows. |
| Ranking data | **DELETE** | Candidate ranking positions and match breakdowns are job-scoped. Purged with candidate rows. |
| Comparison data | **DELETE** | AI comparison outputs and candidate evaluation metrics are discarded with candidates. |
| Imports | **DELETE** | `ImportSession` rows with `jobId = deletedJobId` are explicitly deleted. |
| Resume/file | **DELETE** | `Candidate.resumeData` binary buffer stored in PostgreSQL is dropped. Mailbox originals remain untouched. |
| User | **PRESERVE** | Shared platform account. Never touched by job deletion. |
| Workspace | **PRESERVE** | Shared organizational container. Never touched by job deletion. |
| AuthSession | **PRESERVE** | Active user credentials and sessions remain valid. |
| Minimal deletion audit | **PRESERVE** | Lightweight `PlatformActivity` event logged (`action: 'JOB_PERMANENTLY_DELETED'`) without PII. |

---

## Database Integrity

Orphans after deletion:
**Expected: 0** — Verified: **0**

Shared records incorrectly deleted:
**Expected: 0** — Verified: **0**

---

## Security Tests

Active job direct deletion:
**PASS** (`409 Conflict` returned by server, database completely unchanged)

Unauthorized deletion:
**PASS** (`403 Forbidden` for standard recruiters; `401 Unauthorized` for unauthenticated callers)

Cross-workspace deletion:
**PASS** (`404 Not Found` when trying to delete a job in another workspace)

---

## Activity

Deletion attributed to authenticated user:
**YES**

Admin can see who deleted job:
**YES** (Logged under `JOB_PERMANENTLY_DELETED` in PlatformActivity and Admin Activities dashboard)

---

## Final Requirement

A CLOSED job explicitly deleted by an authorized user permanently removes all data owned exclusively by that job while preserving shared platform/account data:

**PASS**
