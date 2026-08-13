# HR Resume Screening Dashboard — Quick User Guide & Operations Manual

Welcome to the **HR Resume Screening Dashboard V1**! This application is designed to streamline recruitment screening by retrieving candidate applications from Microsoft Outlook, parsing resumes directly in memory without saving local files, and scoring candidate profiles against Job Descriptions (JDs) using an explainable 0–100 relevance engine.

---

## 1. Quick Step-by-Step HR Workflow

### Step 0: Sign In
1. Open the application in your browser (e.g. `http://localhost:5173`).
2. Enter your recruiter email address and password, then click **"Sign in"**.
3. Candidate information is only reachable after signing in. If you open a
   candidate link while signed out you are sent to the sign-in screen first, and
   returned to that link once you are in.
4. Sessions last 12 hours by default. When one expires you are prompted to sign
   in again; nothing you were viewing stays on screen.
5. Sign out from the account menu in the top-right corner.

If you do not have an account, ask your administrator to create one — accounts
are provisioned on the server, not self-registered.

### Step 1: Read the Dashboard
The dashboard opens on a live summary of your hiring activity:

- **Metric cards** — total candidates, shortlisted, awaiting review, active jobs,
  strong matches, average match score, and this week's applications. Click
  anywhere on a card to open the matching candidate list, already filtered.
- **Hiring pipeline** — how many candidates sit at each review stage. Each stage
  row opens that stage's candidates.
- **Match distribution** — scored candidates grouped by relevance band.
- **Recent candidates and jobs** — the newest activity; each row opens directly.

### Step 2: Create a Job
1. Click **"+ Create job"**.
3. Enter the **Job Title** (e.g. `Senior React Developer`).
4. Drag and drop or browse to upload the **Job Description (JD)** document (supported formats: `.pdf`, `.docx`, `.txt` up to 5 MB).
5. Click **"Create Job & Extract JD"**. The system processes the document in memory and extracts core job requirements (`requiredSkills`, `minimumExperience`, `preferredSkills`, `preferredEducation`).

### Step 2: Connect Microsoft Outlook
1. In the top navigation bar or on the Job Overview page, check your **Outlook Connection Status**.
2. If disconnected, click **"Connect Outlook"**.
3. Sign in with your official Microsoft 365 / Outlook account and consent to requested delegated permissions (`User.Read`, `Mail.Read`).
4. Upon redirect back to the app, your connected account email (e.g. `hr@company.com`) will display a green **"Connected"** badge.

### Step 3: Select Mail Folder & Date Range
1. From the Job Overview page, click **"Import Candidates"** (or navigate to `/jobs/:id/import`).
2. Select the target mail folder from the dropdown menu (e.g. `Naukri`, `Recruitment`, or `Inbox`).
3. Choose the **From Date** and **To Date** corresponding to when candidate emails were received.
4. Click **"Find Applications"**. The system scans the mailbox and displays a breakdown of discovered PDF and DOCX resume attachments.

### Step 4: Automatically Process & Parse Resumes
1. Click **"Process Resumes"**.
2. The application retrieves attachment bytes directly into memory (`Buffer`), extracts readable text, parses candidate details (Name, Email, Phone, Experience, Skills, Education, Projects), and saves candidate records into the database.
3. The system enforces database-level duplicate protection so running an import twice will never create duplicate candidate records.

### Step 5: Analyze Candidates & View Rankings
1. Click **"Analyze Candidates"** (or click **"Run Score Engine Now"** on the Candidates list page).
2. The 100-point scoring engine compares each candidate profile against the JD requirements and calculates an explainable match score (0–100%).
3. Click **"View Candidates"** to open the **Ranked Candidate Dashboard** (`/jobs/:id/candidates`). Candidates appear sorted descending by highest match score first (e.g. 94%, 91%, 87%).

### Step 6: Search, Filter, and Review Candidates
Open **Candidates** in the sidebar for every applicant across all roles, or use a
job's **View candidates** button for one role.

1. **Search**: One box searches name, email, phone, current role, location,
   qualification and skills. It is case-insensitive and matches partial text.
   Results update shortly after you stop typing.
2. **Status tabs**: Switch between All, In Review, Needs Review, Shortlisted and
   Not Suitable. Each tab shows its count.
3. **Filters** (click **Filters**): match score, experience range, skill and
   location. Filters combine — for example React **and** 4–6 years **and**
   Gurugram — and the skill and location lists only offer values that actually
   exist in your candidate pool.
4. **Sort**: highest or lowest match, newest or oldest applied, most or least
   experience, name, or recently updated.
5. **Your view is in the address bar.** Refreshing keeps your filters, the browser
   Back button returns you to the same result set, and you can share or bookmark a
   filtered view.
6. **Open a candidate**: click anywhere on the candidate card. The email, call,
   LinkedIn and status controls on the right act on their own and will not open
   the profile.

### Step 7: Review a Candidate Profile
The profile header carries everything needed to make contact — name, current role
and company, location, email, phone, experience, the role applied for and the
application date — with copy buttons beside the contact details.

Tabs organise the rest:

| Tab | Contents |
| --- | --- |
| **Overview** | Professional summary, grouped skills with requirement matches highlighted, work history, education, the contact panel and the explainable score breakdown |
| **Experience** | Full employment history with durations, plus projects and certifications |
| **Skills** | All skills by category, required skills the resume did not evidence, languages and achievements |
| **Resume** | The original document (PDF previews inline) plus the extracted text |
| **Notes** | Add a note and read the note history with authors and timestamps |
| **Activity** | Every recorded action: imports, status changes, notes, re-scoring, resume access |

Anything the resume did not contain is shown as **"Not provided"**. The system
never fills gaps with guessed values.

### Step 8: Contact the Candidate and Record Your Decision
1. **Contact**: use **Email candidate**, **Call**, or **LinkedIn** in the header,
   or the **Contact candidate** panel for copy buttons on every channel.
2. **Draft outreach**: **Draft outreach email** opens a prepared message
   referencing the role and the candidate's relevant skills. Edit it, then copy it
   or hand it to your mail client. **Nothing is ever sent automatically.**
3. **Open or download the resume**: **Open resume** views it in a new tab;
   **Download** saves the original file. If a candidate was imported before resume
   files were retained, the Resume tab says so and offers the extracted text.
4. **Record your decision**: set **Status** to Shortlisted, Needs Review or Not
   Suitable. The change saves immediately and is recorded on the Activity tab.
5. **Add a note**: capture screening feedback, notice period or salary discussion
   on the Notes tab. Notes are visible to your whole recruiting team.

---

## 2. Responsible AI & Ethical HR Guidance

> [!IMPORTANT]
> **Ethical HR Screening Policy**:
> - The **Job-Relevance Match Score (0–100%)** is a technical relevance indicator designed to assist HR recruiters in prioritizing resume review.
> - **Sensitive Personal Attributes**: Age, Date of Birth, Gender, Religion, Caste, Race, Ethnicity, Marital Status, Health Data, and Candidate Photos are **strictly excluded** from the scoring engine.
> - **No Automated Hiring or Rejections**: The system never automatically hires or rejects candidates. Final shortlisting and hiring decisions are exclusively made by human HR professionals.
> - **No Automated Outreach**: The dashboard never sends email. Outreach drafts are prepared for you to review and send yourself.
> - **No Invented Candidate Data**: Fields the resume did not contain are shown as "Not provided". The system does not infer or generate candidate details.

### Handling candidate personal data

Candidate profiles contain personal data, so treat access as privileged:

- Sign in with your own account and never share credentials.
- Sign out on shared machines. Candidate data disappears from the screen immediately.
- Candidate links only work for signed-in recruiters, so sharing a profile URL grants nothing on its own.
- Export or forward candidate details only where your organisation's data-protection policy allows it.

---

## 3. HR Support & Troubleshooting Guide

### Issue 1: "Microsoft Outlook is not connected"
- **Cause**: OAuth token session has expired or Outlook was not connected.
- **Solution**: Click **"Connect Outlook"** in the top navigation bar, sign in with your Microsoft account, and return to the application.

### Issue 2: "No candidate emails found for the selected date range"
- **Cause**: No candidate emails were received in the selected folder within the specified dates, or the folder selection was empty.
- **Solution**: Verify the mail folder selection (e.g. `Naukri` vs `Inbox`) and broaden the date range to ensure full day coverage.

### Issue 3: "Scanned document or unreadable text"
- **Cause**: Candidate resume is a scanned image-only PDF containing no extractable text.
- **Solution**: Open the **Resume** tab and use **Open resume** to read the document yourself. The profile will show "Not provided" for fields that could not be read rather than guessing at them.

### Issue 5: "Original document not available"
- **Cause**: The candidate was imported before resume files were retained, or the mailbox holding the resume is no longer connected.
- **Solution**: The extracted resume text is still on the **Resume** tab. To restore the original file, re-upload the resume or reconnect the Outlook mailbox.

### Issue 6: "Some profile fields are empty"
- **Cause**: The resume did not state them, or its layout could not be read reliably (heavily designed or two-column resumes are the usual cause).
- **Solution**: Expand **Parsing notes** under the professional summary to see what could not be extracted, and read the original document on the Resume tab. Fields are deliberately left blank rather than filled with a guess.

### Issue 7: "Please sign in to continue"
- **Cause**: Your 12-hour session expired, or you signed out in another tab.
- **Solution**: Sign in again. You are returned to the page you were trying to reach.

### Issue 4: "Duplicate application skipped"
- **Cause**: The candidate's resume attachment was already imported for this specific job.
- **Solution**: No action required. The system automatically preserves the original candidate profile and avoids duplicate records.
