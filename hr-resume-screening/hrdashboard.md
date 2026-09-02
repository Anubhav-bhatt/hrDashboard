HR Resume Screening & AI Recruitment Platform

Complete Project Context & Continuation Source of Truth

Portable project brief compiled from the project's development discussions. Use this file when moving the project into another ChatGPT/Claude/Codex workspace.

Important: This document records product intent, architecture, historical verified work, planned work, known blockers, and UX direction. It is NOT proof that every planned feature currently exists. For implementation status, Git + source code + tests + runtime behavior are authoritative.

1. Product Vision

This project began as an HR resume-screening dashboard and evolved into an AI-assisted recruitment operating system.

The core lifecycle is:

Create Job
→ Add / Import Candidates
→ Review Strong Matches
→ Screen
→ Compare
→ Shortlist
→ Select Candidate
→ Close Job
→ Closed Job History

The product must be significantly easier than a traditional ATS or job portal. It must not feel like Naukri, an ERP, a dense admin dashboard, or a collection of disconnected AI chatbots.

The target experience is:

Simple enough for a first-time recruiter, fast enough for a power user, and polished enough that people prefer doing recruitment work inside it.

Every important screen should answer:

Where am I?

What matters right now?

What should I do next?

The strongest interaction rule is:

If the system already knows something, never ask the recruiter to select it again.

2. Core Product Requirements

The existing platform is built around these domains:

Authentication/session

Dashboard

Jobs

Job creation

Job details / requirements

Job search

Active vs Closed jobs

JD upload/reference

Resume ingestion

Bulk upload

Candidates

Candidate detail

Candidate search

Candidate filters

Match scoring

Scoring breakdown

Shortlisting

Candidate selection

Job closure

Closed Jobs

Dashboard analytics

AI feature flags

Screening

Ranking

Comparison

future Insights

future unified AI Assistant

Existing working recruitment functionality must remain protected during AI/UI development.

3. Original Recruitment Workflow

The original product goal was to reduce recruiter effort without depending on a Naukri API.

Conceptually:

Create Job
↓
Upload / define JD
↓
Import or upload resumes
↓
Parse candidate data
↓
Evaluate against job requirements
↓
Show match score
↓
Search / filter / review
↓
Shortlist
↓
Select candidate
↓
Close job

The platform later added the requirement that once a candidate has been selected, the job can be closed. Closed jobs should have a dedicated sidebar section and their data should contribute to the dashboard.

4. Technology Architecture

Known project architecture:

Frontend

React
Vite
Tailwind CSS
React Router
JavaScript

Backend

Node.js
Express
Prisma
PostgreSQL
JavaScript

AI Development Mode

Current development philosophy:

AI_PROVIDER=mock

Paid model integrations were deliberately postponed.

The objective is to build and verify:

architecture

tools

agents

context

routing

UX

security

evaluation

before paying for external LLM calls.

5. Git Strategy

AI development was isolated on:

feature/ai-recruitment

This is the correct strategy because AI development affects:

routes

UI

state/context

feature flags

agent modules

future provider integrations

tests

Do not merge or push casually without verification.

Historical commits reported during the project included:

092c5f8  feat(ai): add provider-agnostic mock AI foundation
19d35e9  feat(ai): add controlled recruitment data tool layer
8e9940e  feat(ai): add functional mock candidate ranking agent
de56ea0  feat(ai): add functional mock candidate comparison agent
8413b19  fix(ui): restore dark mode and accessibility
789f2bd  fix: stop leaking Prisma internals and meet AA contrast

These are historical references. Always inspect the current repo before relying on them.

6. AI Product Strategy

An important design decision was made: exposing too many AI agents would exhaust/confuse users.

The desired model is:

                 Unified AI Recruitment System
                           │
                    AI Assistant
                           │
                Shared Recruitment Context
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
   Screening            Ranking           Comparison
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                        Insights
                           │
                  Controlled AI Tools
                           │
                Existing Business Services
                           │
                      PostgreSQL

The user may intentionally choose a specialist task such as Ranking or Comparison, but internally the system should behave as one coordinated recruitment intelligence layer.

User-facing AI modes should remain limited to:

AI Assistant
Screening
Ranking
Comparison
Insights

Do not expose every internal helper as an agent.

7. AI Assistant Philosophy

The main Assistant should eventually understand broad recruiter requests such as:

Show me the strongest candidates for this role.
Compare the top two.
Screen Rahul.
What needs my attention?

However, it must NOT become a blank-chat-first product.

Preferred experience:

AI Assistant

Current job
React Developer

42 candidates
12 strong matches
4 shortlisted

Recommended next step
Review strong matches

[Review Matches]

Other actions
[Rank Candidates]
[Compare Shortlisted]
[Ask AI]

Direct task actions should remain available. Users should not be forced to type commands for obvious actions.

8. Specialist AI Modes

Screening

Question answered:

How well does this candidate fit this job?

Inputs:

job

candidate

optional focus

Outputs should include:

fit summary

strengths

gaps

risks

criteria review

data warnings

The existing Match Score remains authoritative.

Do not casually create a second official AI score.

Ranking

Question answered:

Which candidates deserve recruiter attention first?

Inputs may include:

job

candidate scope

existing filters

optional preference

Results should provide ordered candidates and concise evidence.

Important actions:

Compare Top 2
Compare Top 3
Compare Selected
Screen Candidate

Comparison

Question answered:

What are the important trade-offs between these candidates?

A previously implemented comparison contract included concepts such as:

candidates[]
criteria[]
tradeoffs[]
bestByDimension[]
warnings[]

Criteria statuses included:

MATCH
PARTIAL
GAP
UNKNOWN
INSUFFICIENT_DATA

Comparison should be evidence-based and should not compare protected personal characteristics.

Historically, comparison was limited to roughly 2–5 candidates.

Insights

Future Insights should surface:

pipeline health

jobs needing attention

bottlenecks

recruitment metrics

job-level analytics

It should feel like contextual analytics rather than another generic chatbot.

9. Provider-Agnostic AI Foundation

An early AI phase established a provider-agnostic mock foundation.

Historical commit:

092c5f8 feat(ai): add provider-agnostic mock AI foundation

The development strategy intentionally avoided immediate OpenAI/Anthropic/Gemini integration.

Expected current development cost:

External AI API calls: 0
Paid AI integrations: 0
AI API cost: ₹0

Real providers should be integrated only after workflows and security are stable.

10. Controlled AI Tool Layer — Phase 2

A historically verified report stated:

PHASE 2 PASSED — CONTROLLED AI TOOL LAYER READY

The architectural rule was:

AI Tool
   ↓
Existing Business Service
   ↓
Prisma
   ↓
PostgreSQL

AI tool modules should not directly import Prisma.

This prevents the AI layer from becoming a duplicate backend.

11. Existing AI Tools

The Phase 2 report identified 12 read-only tools:

Tool

Purpose

getJobs

List/search jobs

getJob

One job + requirements/pipeline

getJobRequirements

Structured hiring criteria

getCandidate

Sanitized candidate summary

getCandidates

Candidates for a job

searchCandidates

Cross-job filtered search

getCandidateScore

Stored overall score

getScoringBreakdown

Per-dimension score data

getJobRankingData

Existing ranking data

getDashboardMetrics

Dashboard totals

getJobMetrics

Per-job statistics

getPipelineMetrics

Pipeline stage counts

searchJobs was intentionally unnecessary because getJobs({search}) already covered job search.

12. AI Tool Security

The tool layer was designed around strict controls:

read-only registration

central registry

no arbitrary module path execution

no shell execution

no filesystem execution

no direct Prisma import from tools

server-side permission resolution

sanitized output

explicit limits

Frontend identity must never be trusted as authority.

Conceptual identity flow:

Authenticated session
→ req.user
→ normalized agent context
→ permissions
→ tool permission check
→ business service

Server-owned values such as user identity/role/request metadata must not be overridden by frontend context.

13. AI Data Sanitization

Candidate data passed to AI tools was intentionally restricted.

Historically excluded candidate fields included:

email
alternateEmail
phone
alternatePhone
linkedinUrl
githubUrl
portfolioUrl
resumeText
resumeData
resumeFileName
notes
noteEntries
activities
summary
outlookMessageId
outlookAttachmentId
resumeHash
sourceRelativePath
parsedProfile

Candidate names remained because ranking/comparison must identify candidates.

Raw resumes should not be repeatedly sent through AI workflows.

Shared frontend context must also avoid sensitive data.

14. Tool Limits

Previously reported limits included:

default candidate limit: 50
configured candidate max: 200
effective application max: 100
default job limit: 25
maximum job limit: 100

Over-limit requests should fail explicitly rather than silently pretending the requested amount was returned.

15. Existing Scoring Is Authoritative

The platform already has a scoring system.

AI must build on it rather than create confusing duplicate metrics.

Use:

Match Score
Existing Match Score

Avoid:

AI Score

unless a future product requirement explicitly defines and explains a new score.

16. Ranking / Comparison History

Historical development added functional mock Ranking and Comparison agents.

Relevant commits reported:

8e9940e feat(ai): add functional mock candidate ranking agent
de56ea0 feat(ai): add functional mock candidate comparison agent

At least some URL/prop-level handoff existed:

Ranking
→ Comparison
→ Screening

with job/candidate identifiers carried between pages.

Important distinction:

URL-level handoff is NOT the same as a complete shared AI context/session layer.

This distinction later blocked Phase 8.

17. Shared Context Problem

A later repository audit reported that Phase 7 shared context had not actually been built at that time.

The audit found no meaningful implementation of concepts such as:

AIWorkspaceContext
AISession
lastRankingCandidateIds
lastComparisonCandidateIds
sourceMode
navigateWithContext
clearContext
/api/ai/sessions
assistant.agent.js

At that time:

Cross-agent handoff = partially real
Shared context/session = missing

Therefore Phase 8 was correctly blocked.

Because subsequent development was interrupted, the CURRENT repo must now be inspected to determine whether Phase 7 was later partially or fully implemented.

18. Phase 7 Intended Architecture

Phase 7 was redesigned around the recruitment lifecycle rather than around chatbot memory.

Shared context exists to remove repeated selection.

Suggested lightweight state:

currentJobId
selectedCandidateIds
lastRankingCandidateIds
lastComparisonCandidateIds
currentTask
currentLifecycleStage
sourceWorkflow
activeFilters
comparisonFocus
screeningFocus

Do NOT store:

raw resumes
full candidate objects
full job objects
candidate contact details
auth tokens
API keys
permissions as authority

Authoritative business data should be refetched from existing APIs/services/tools.

19. Context Persistence

Possible mechanisms discussed:

URL parameters
sessionStorage
backend session

The preferred first implementation was lightweight browser/session/URL state rather than a heavy backend session system.

If browser persistence is used, consider:

version: 1

and safely discard invalid/corrupt/stale state.

20. Critical Cross-Job Invalidation

This is a non-negotiable correctness rule.

Scenario:

Job A
Candidates A1 A2 A3
↓
Ranking
↓
Comparison
↓
Switch to Job B

Expected:

A1/A2/A3 candidate context is cleared.

Job B must never inherit Job A candidates.

Candidate-specific ranking/comparison/screening context must be invalidated when the current job changes.

21. Intended Contextual Handoffs

Job Detail → Ranking

Carry current job automatically.

Ranking → Comparison

Carry:

current job

selected/top candidate IDs

candidate order

source workflow

Comparison → Screening

Carry:

current job

selected candidate

comparison source

Screening → Comparison

Restore previous comparison set where the user came from Comparison.

Candidate Detail → Screening

Carry candidate + relevant job.

The user should not repeatedly choose the same entities.

22. Lifecycle-Aware UX

The UI may derive presentation stages from existing business state.

Potential UX-only stages:

JOB_CREATED
CANDIDATES_PENDING
CANDIDATES_AVAILABLE
REVIEWING
SHORTLISTING
FINAL_REVIEW
CANDIDATE_SELECTED
JOB_CLOSED

These should generally remain derived UI states rather than new database enums.

Example:

candidateCount = 0
→ Add Candidates

candidates exist, no shortlist
→ Review Matches

shortlisted candidates exist
→ Compare / Final Review

selected candidate exists, job open
→ Close Job

job closed
→ View Closed Job

23. Recommended Next Action

A deterministic helper was proposed conceptually:

getRecommendedNextAction(jobState)

Possible supported actions:

ADD_CANDIDATES
REVIEW_MATCHES
RANK_CANDIDATES
COMPARE_SHORTLISTED
SCREEN_CANDIDATE
SHORTLIST
SELECT_CANDIDATE
CLOSE_JOB
VIEW_CLOSED_JOB

Only expose actions actually supported by the application.

The recommendation engine should be deterministic and based on real state, not fabricated AI output.

24. Job Workspace

The Job Detail page should function as the main role-specific workspace.

Desired hierarchy:

React Developer                         ACTIVE

Job Progress
✓ Job created
✓ Candidates added
→ Review matches
○ Shortlist
○ Select
○ Close

Recommended next step

12 strong candidates are ready for review.

[Review Matches]

Job Summary

Pipeline Summary

Candidates

Secondary actions
[Rank Candidates]
[Compare Shortlisted]
[View Insights]

Do not give every possible action equal visual priority.

25. Dashboard Direction

The dashboard should become actionable rather than merely analytical.

Preferred hierarchy:

What needs attention
↓
Key metrics
↓
Active jobs
↓
Pipeline / analytics
↓
Recent activity

Example:

React Developer
12 strong candidates awaiting review
[Review]

Backend Engineer
3 shortlisted candidates ready to compare
[Compare]

Data Analyst
Candidate selected — ready to close
[Close Job]

Use real data only.

26. Jobs UX

A specific requirement was added for:

Search specific jobs
+
clear Active / Closed indication

The UI direction evolved away from a dense card gallery.

A later UI audit reported that one branch already had:

Jobs index as a table

Import method chooser

Job Workspace stepper

recommended next action

Quick Look headings/dividers

keyboard ↑/↓ navigation

card shadows removed

Therefore future UI work must inspect the current branch before recreating these features.

27. Candidates UX

Candidate presentation should support fast review.

Relevant information:

candidate name

current profession/role

review/status

relevant stream/category if modeled

Match Score

key skills

A view toggle was requested:

Cards ↔ Table

Keep this only if it improves usability.

Candidate pages should remain breathable and professional rather than becoming dense portal screens.

28. Comparison UX

Comparison was specifically simplified after an earlier version felt too complex.

Desired behavior:

setup collapses after comparison starts

comparison matrix becomes primary

summary/tradeoffs clearly separated

manageable number of candidates

criterion statuses easy to scan

clear warnings for unavailable data

Do not bury the answer under setup controls.

29. Sidebar

Recommended structure:

Dashboard

RECRUITMENT
Jobs
Candidates
Uploads

AI RECRUITMENT
AI Assistant
Screening
Ranking
Comparison
Insights

MANAGEMENT
Closed Jobs

User / Settings

The sidebar should remain compact.

Avoid adding an entry for every possible agent/helper.

30. UX North Star in Detail

The product must not resemble a complex Naukri-like portal.

Optimize for:

task-first navigation

minimal cognitive load

progressive disclosure

context-aware actions

smart defaults

clear next steps

few repeated selections

fewer unnecessary page transitions

useful empty states

responsive feedback

Simplification means:

organize
prioritize
guide
hide advanced controls until needed
preserve context

It does NOT mean:

delete advanced features
remove useful filters
remove data
remove professional capability

31. One Dominant Action

Avoid screens where these all compete visually:

[Upload]
[Rank]
[Compare]
[Filter]
[Screen]
[Shortlist]
[Export]

Prefer:

Recommended next step

Review your strongest candidates.

[Review Strong Matches]

Other actions
Rank candidates
Compare shortlisted

32. Progressive Disclosure

Example candidate filters:

Visible first:

Search
Job
Match Score
Status
More Filters

Behind More Filters:

Experience
Location
Qualification
Skills
other supported advanced criteria

Use this principle across the application.

33. Smart Defaults

Where safe:

current job preselected

current candidate preselected

Ranking defaults to relevant scope

Comparison receives selected candidates

related filters persist

returning to Comparison restores the set

Never automatically perform irreversible hiring actions.

34. AI Terminology

Users should see:

AI Assistant
Screening
Ranking
Comparison
Insights

Contextual actions should say:

Rank Candidates
Compare Selected
Screen Candidate
View Insights

Avoid exposing:

LLM
provider
orchestrator
intent
tool call
function execution
context JSON
session ID
tokens
chain-of-thought

35. Human Control

Current AI tools are read-only.

AI should not autonomously:

shortlist

reject

select

close a job

send candidate messages

without a separately designed write-action phase with permissions, confirmations, and auditability.

36. Premium UI Direction

The product should feel like a modern premium B2B SaaS application.

Desired:

strong typography hierarchy

calm neutral surfaces

restrained borders

deliberate whitespace

minimal shadows

consistent control heights

professional status colors

subtle AI accent

smooth interaction

Avoid:

neon

excessive gradients

excessive glassmorphism

giant icons

giant rounded cards

nested cards everywhere

random colors

flashy AI clichés

A historical typography idea used Quicksand Bold/Regular, but the current codebase design system should be inspected before forcing this.

37. Dark Mode & Accessibility

A historical commit restored dark mode and accessibility:

8413b19 fix(ui): restore dark mode and accessibility

Another audit fixed AA contrast issues.

Future UI changes must not regress:

light/dark mode if still supported

keyboard access

visible focus

semantic headings

labels

contrast

reduced motion

screen-reader states

non-color-only statuses

38. Motion

Motion should improve comprehension.

Use subtle transitions for:

sidebar

hover

selected state

dropdown

drawer

results

completion feedback

Respect:

prefers-reduced-motion

Do not gamify hiring.

No points, levels, leaderboards, or confetti are necessary.

39. Feedback & Completion

Replace dry confirmations where possible.

Instead of:

Upload successful.

prefer:

✓ 42 resumes processed

12 strong matches identified.

[Review Strong Matches]

Use real values only.

Job closure should provide a professional completion state:

Job completed

React Developer
Rahul Sharma selected

126 candidates reviewed
8 shortlisted
3 compared
1 selected

[View Closed Job]

Only display metrics actually available.

40. Empty States

Empty states should teach the next action.

Jobs:

No jobs yet.

Create your first role to start screening candidates.

[Create Job]

Candidates:

No candidates yet.

Upload resumes to begin.

[Upload Resumes]

Ranking:

Nothing to rank yet.

Add candidates to this job first.

[Upload Candidates]

41. Error States

Errors should explain recovery.

Example:

We couldn't load candidates.

Your existing data hasn't been changed.

[Try Again]

Avoid exposing raw backend errors.

42. Loading States

Prefer:

skeletons

button progress

inline status

contextual loading

Examples:

Loading candidates...
Processing resumes...
Ranking candidates...
Analyzing candidate...
Preparing comparison...

Do not expose internal chain-of-thought.

43. Responsive Design

Important test widths discussed:

360
375
390
430
768
1024
1280
1440
1920

Mobile requirements:

sidebar → drawer

forms stack

filters collapse

actions remain reachable

comparison has a deliberate mobile design

tables adapt rather than merely shrink

no accidental horizontal page overflow

44. Performance

Premium UX must feel fast.

Audit:

duplicate API calls

unnecessary rerenders

large candidate lists

repeated fetching

heavy blur/effects

large animation dependencies

blocking UI

Performance is part of UX quality.

45. Analytics / B1 Blocker

A later audit discovered a release-blocking inconsistency known as B1.

Reported state at that time:

dashboard-analytics frontend artifact: missing
E2E suites: still expecting it
PipelineStage: dead code remained

The correct recommendation was:

Fix/restore actual analytics behavior rather than deleting test assertions merely to make tests green.

Analytics remains strategically useful for:

Dashboard

job health

pipeline metrics

future Insights

recommended actions

The CURRENT repository must be inspected to determine whether B1 has since been fixed.

46. Environment/Test Issues Seen Historically

A previous Phase 2 audit reported environmental problems:

empty DB prevented one fixture-dependent E2E scenario from completing

stale VITE_API_URL local IP caused session/login issues

fixture-independent suites passed

Future audits must distinguish:

code defect
environment problem
missing fixtures

Do not change product code to hide environment problems.

47. Development Interruption

Recent Claude development stopped because usage limits were exhausted.

Therefore recent planned work may be:

fully implemented

partially implemented

uncommitted

half-connected

not started

Do not trust previous prompt completion.

Before continuing:

git status
git branch --show-current
git branch -vv
git log --oneline --decorate -20
git diff
git diff --cached

Do NOT immediately reset, restore, clean, stash, or discard work.

48. Recovery Classification

Classify recent requirements as:

VERIFIED
IMPLEMENTED-UNTESTED
PARTIAL
PLACEHOLDER
BROKEN
NOT IMPLEMENTED

A file existing is not proof of completion.

Trace real behavior.

49. Phase 7 Verification Checklist

The current repo must be checked for:

Shared context/store
Context provider mounting
Context persistence
currentJobId
selectedCandidateIds
lastRankingCandidateIds
lastComparisonCandidateIds
currentTask
currentLifecycleStage
sourceWorkflow
activeFilters
clear behavior
job-change invalidation
Job → Ranking
Ranking → Comparison
Comparison → Screening
Screening → Comparison
Candidate → Screening
refresh
browser back/forward
race/stale request protection

50. Race Condition Requirement

Scenario:

Job A selected
request starts
→ user immediately switches to Job B

A stale Job A response must not overwrite Job B state.

Use an architecture-appropriate mechanism such as:

AbortController

request IDs

stale-response guards

51. Backend Revalidation

Frontend context is convenience, never authorization.

Even if the frontend carries:

jobId
candidateIds

the backend must revalidate:

job exists

candidate exists

candidate is accessible

candidate belongs to job where required

authenticated user is permitted

52. AI Feature Flags

Known/intended feature flags include concepts such as:

AI_ENABLED
AI_SCREENING_ENABLED
AI_RANKING_ENABLED
AI_COMPARISON_ENABLED
AI_INSIGHTS_ENABLED

Verify exact names in source.

With:

AI_ENABLED=false

core recruitment must continue working:

Jobs
Candidates
Uploads
Scoring
Shortlisting
Selection
Closure
Closed Jobs
Dashboard

With:

AI_ENABLED=true
AI_PROVIDER=mock

implemented AI workflows should work without paid API calls.

53. Phase 8 Direction

Phase 8 should eventually become:

Unified Lifecycle-Aware AI Assistant Orchestrator

It depends on reliable Phase 7 context.

Desired follow-up behavior:

User: Rank candidates for this job.
System: [ranking result]

User: Compare the top 2.

The second request should resolve top 2 from the prior ranking without asking the user to reselect everything.

Do not implement Phase 8 on top of missing shared context.

54. UI Portability

When moving UI work into another project:

Preserve:

lifecycle

information architecture

real entity semantics

navigation

Match Score semantics

specialist AI tasks

context behavior

responsive rules

accessibility

Mock data may be used for design work, but do not invent unsupported product capabilities.

55. Suggested Page Map

Adapt to actual routes:

/login
/dashboard
/jobs
/jobs/:jobId
/jobs/:jobId/candidates
/candidates
/candidates/:candidateId
/uploads
/closed-jobs
/ai
/ai/screening
/ai/ranking
/ai/comparison
/ai/insights

Do not change route contracts merely for visual redesign without a migration reason.

56. Suggested Shared Components

Potential components:

AppShell
Sidebar
PageHeader
SectionHeader
StatusBadge
MetricCard
SearchInput
FilterBar
FilterChip
EmptyState
ErrorState
Skeleton
LoadingButton
JobRow / JobCard
CandidateRow / CandidateCard
CandidateSelector
MatchScore
LifecycleProgress
RecommendedAction
AIContextSummary
AgentHeader
ScreeningResult
RankingResult
ComparisonMatrix

Do not over-abstract.

57. Ideal Recruiter Journey

Login
↓
Dashboard shows what needs attention
↓
Open React Developer
↓
Job Workspace shows progress
↓
12 strong candidates need review
↓
Review / Rank
↓
Compare Top 3
↓
Screen one candidate
↓
Return to comparison
↓
Shortlist
↓
Select final candidate
↓
Job Workspace recommends Close Job
↓
Close Job
↓
View Closed Job summary

The recruiter should not repeatedly select React Developer during this flow.

58. Ideal AI Experience

Bad:

Leave workflow
→ open chatbot
→ explain job
→ explain candidate
→ ask AI

Desired:

Already inside React Developer
→ Rank Candidates
→ Compare Top 3
→ Screen Rahul

The system carries context automatically.

Free text remains available for questions that do not map cleanly to direct actions.

59. First-Time User Standard

A user unfamiliar with ATS software should be able to understand:

Create Job
Add Candidates
Review Matches
Screen
Compare
Shortlist
Select
Close

without documentation.

If the UI makes the user ask:

What do I do now?

improve the guidance.

60. Power User Standard

A frequent recruiter should be able to execute:

Open Job
→ Rank
→ Compare Top 3
→ Screen #1

with very few interactions.

Guidance must not become forced tutorials.

61. Preserve User Place

Where practical preserve:

current job

active filters

selected candidates

comparison set

source workflow

list/scroll context

while avoiding stale cross-job state.

62. No Duplicate Business Logic

Frontend may derive presentation guidance but must not become authoritative for:

official Match Score

candidate status

selected candidate

job closure

dashboard metrics

Backend/business services remain authoritative.

63. Testing Gate

Every significant phase should verify:

Authentication
Dashboard
Jobs
Create Job
Uploads
Candidates
Search
Filters
Scoring
Shortlisting
Selection
Job Closure
Closed Jobs
Screening
Ranking
Comparison
AI feature flags

Use actual scripts in the repository.

Do not invent commands.

Attempt a production build.

Inspect browser console/network during smoke testing.

64. Source of Truth Priority

When information conflicts, use this order:

1. Current runtime behavior
2. Current source code
3. Current tests
4. Current Git history/diff
5. Historical verified reports
6. Planned prompts / roadmap

A prior phase label is not proof that the phase exists today.

65. Known Risk Areas for Takeover

Inspect these first:

Git working tree after interrupted Claude session

B1/dashboard analytics

actual Phase 7 status

shared context provider/store

job-change invalidation

Ranking → Comparison

Comparison → Screening

Screening → Comparison restoration

refresh/back-forward

stale async responses

AI Assistant actual implementation

feature flags

dark mode/accessibility

environment configuration

E2E fixtures

66. Recommended Continuation Sequence

Only after auditing the current repo:

Repair clear interruption damage
↓
Resolve/verify B1
↓
Full regression/audit GO
↓
Complete Phase 7 shared lifecycle context
↓
Verify handoffs + invalidation
↓
Lifecycle-aware Assistant shell
↓
Phase 8 unified Assistant orchestration
↓
Insights
↓
Premium UX polish
↓
Real AI provider integration
↓
Evaluation + cost controls
↓
Production hardening

Do not skip gates merely to preserve phase numbers.

67. Non-Negotiable Product Rules

Existing recruitment functionality must not regress.

AI development remains mock/provider-agnostic until explicitly changed.

Existing Match Score remains authoritative.

AI tool access remains controlled and sanitized.

Core AI tools remain read-only until a separately designed write phase.

Shared context is never authorization.

Cross-job stale candidate context must be impossible.

User-facing AI complexity remains low.

The product must be easier than a traditional ATS/job portal.

The recruitment lifecycle organizes the experience.

Free-text chat is not the only interface.

Dashboard should be actionable.

Context should eliminate repeated selection.

Accessibility must not regress.

Mobile/responsive behavior must be deliberate.

No unsupported metrics or candidate facts may be invented.

Source/tests/runtime outrank old summaries.

68. Instruction for a New Coding AI

Give the coding assistant this instruction together with this file:

Read this project-context document completely before modifying code.

Treat it as product and architecture context, NOT as proof that every planned feature exists.

First inspect the actual repository.

Classify relevant requirements as:

VERIFIED
IMPLEMENTED-UNTESTED
PARTIAL
PLACEHOLDER
BROKEN
NOT IMPLEMENTED

Do not rebuild verified functionality.
Do not assume planned phases were completed.
Preserve all existing recruitment workflows.

Use Git, source code, tests, and runtime behavior as implementation truth.

The UX lifecycle is:

Create Job
→ Add Candidates
→ Review Matches
→ Screen
→ Compare
→ Shortlist
→ Select
→ Close Job

Every important screen should answer:

Where am I?
What matters now?
What should I do next?

And the core context rule is:

If the system already knows something, never ask the recruiter to select it again.

69. Immediate Takeover Procedure

Because recent development may be interrupted, the next action should be:

Audit actual repository
↓
Find last verified commit/state
↓
Inspect uncommitted changes
↓
Classify recent Phase 7/UX work
↓
Repair only obvious interruption damage
↓
Run tests/build
↓
Determine exact first unfinished requirement
↓
Continue from there

Do NOT automatically start Phase 8.

70. Final Product Definition

The clearest single-sentence definition of the product is:

An AI-assisted recruitment workspace that guides recruiters from job creation to candidate selection and closure, while keeping candidate evidence, Match Scores, permissions, and hiring decisions grounded in the existing recruitment system.

The desired user feeling is:

I know what to do.
The system remembers where I am.
I don't have to repeat myself.
I can review candidates quickly.
AI is helping rather than creating more work.
The interface feels professional and calm.

That is the product target.

71. Final Source-of-Truth Note

This file captures the project's:

product origin

functional scope

architecture

AI strategy

controlled tool layer

specialist AI modes

shared-context requirements

lifecycle UX

UI principles

security model

cost strategy

historical development

known blockers

interrupted-development recovery plan

continuation roadmap

But always remember:

This document explains what the project is supposed to be and why. The repository explains what currently exists.

Use both before continuing development.