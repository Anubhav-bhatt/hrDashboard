const prisma = require('../config/prisma');

/**
 * Permanent deletion of a closed job and everything it owns.
 *
 * This is the only destructive operation in the application, and it is
 * deliberately not the same thing as closing a job:
 *
 *   close  -> the hiring cycle is finished; every record is preserved and moves
 *             out of active work into Closed Jobs.
 *   delete -> the records are destroyed and the storage they occupied is
 *             released. Nothing here can be undone.
 *
 * The rules are enforced on the server because hiding a button is not a control:
 *
 *   - only a CLOSED job may be deleted, never an open one;
 *   - the caller must echo the job's exact title, so a stray click, a repeated
 *     request or a forged one cannot destroy a role nobody named;
 *   - the whole deletion is one transaction, so it either happens completely or
 *     not at all.
 *
 * What "storage" means here was established by auditing the code rather than
 * assumed: this platform writes no files. Resume bytes live in
 * `Candidate.resumeData` and the job description in `Job.jdText`, both Postgres
 * columns, so deleting the rows *is* the storage release and there is no
 * separate filesystem or object-store pass to run. See `summarise` below.
 */

/**
 * Error carrying a stable machine-readable code.
 *
 * Mirrors JobClosureError: the code is what the API surfaces, the message is
 * written for a recruiter, and neither ever leaks Prisma internals or SQL.
 */
class JobDeletionError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'JobDeletionError';
    this.code = code;
    this.statusCode = statusCode;
    this.expose = true;
  }
}

/**
 * Normalises a confirmation phrase for comparison.
 *
 * Case and surrounding whitespace are forgiven because they are typing
 * accidents, not signs of a different intent. Nothing else is: the words
 * themselves must match the role being destroyed.
 */
const normalise = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '');

/**
 * What a job is about to cost, measured before anything is removed.
 *
 * Counted inside the same transaction as the deletion so the summary reports
 * what was actually destroyed rather than a snapshot from before some
 * concurrent change.
 *
 * @param {Object} tx Prisma transaction client
 * @param {string} jobId
 */
const measure = async (tx, jobId) => {
  const candidates = await tx.candidate.findMany({
    where: { jobId },
    select: { id: true, resumeData: false, resumeSize: true, source: true }
  });

  const candidateIds = candidates.map((candidate) => candidate.id);

  const [notes, activities, importSessions, storedResumes] = await Promise.all([
    tx.candidateNote.count({ where: { candidateId: { in: candidateIds } } }),
    tx.candidateActivity.count({ where: { candidateId: { in: candidateIds } } }),
    tx.importSession.count({ where: { jobId } }),
    // Resume bytes actually held by us. Outlook-sourced candidates deliberately
    // store none — those resumes are re-fetched from the mailbox on demand, so
    // there is nothing of theirs to release and nothing of theirs to destroy.
    tx.candidate.count({ where: { jobId, resumeData: { not: null } } })
  ]);

  return {
    candidates: candidates.length,
    notes,
    activities,
    importSessions,
    storedResumes,
    resumeBytes: candidates.reduce((total, candidate) => total + (candidate.resumeSize || 0), 0),
    outlookSourced: candidates.filter((candidate) => candidate.source === 'OUTLOOK').length,
    candidateIds
  };
};

/**
 * Permanently deletes a closed job, its candidates and everything hanging off
 * them.
 *
 * @param {Object} params
 * @param {string} params.jobId
 * @param {string} params.confirmation Must equal the job's title
 * @param {Object|null} [params.actor] Signed-in user ({ id, name, email })
 * @returns {Promise<Object>} A summary of what was destroyed
 * @throws {JobDeletionError}
 */
const deleteClosedJob = async ({ jobId, confirmation, actor = null }) => {
  const summary = await prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true, status: true, closedAt: true, selectedCandidateId: true }
    });

    if (!job) {
      throw new JobDeletionError('JOB_NOT_FOUND', 'Job not found.', 404);
    }

    /*
     * The lifecycle gate. An open role is live recruitment and its candidates
     * are live work, so there is no path — not even an authorised one — that
     * destroys it. Closing first is deliberate friction: it makes the recruiter
     * record the outcome before the record can be discarded.
     */
    if (job.status !== 'CLOSED') {
      throw new JobDeletionError(
        'JOB_NOT_CLOSED',
        'Only a closed job can be permanently deleted. Close this job first.',
        409
      );
    }

    // The caller has to name what they are destroying. This is what makes a
    // single stray click — or a replayed request — incapable of deleting a role.
    if (!normalise(confirmation) || normalise(confirmation) !== normalise(job.title)) {
      throw new JobDeletionError(
        'DELETE_CONFIRMATION_MISMATCH',
        'Type the job title exactly as shown to confirm permanent deletion.',
        400
      );
    }

    const before = await measure(tx, job.id);

    /*
     * Deleted explicitly, child-first, rather than leaning on the database
     * cascade.
     *
     * Postgres would in fact cascade all of this from a single `job.delete()` —
     * that was verified against the live schema, including through raw SQL. Two
     * reasons not to rely on it anyway: `deleteMany` returns the row count each
     * step actually removed, which is what makes the summary below a measurement
     * rather than an estimate; and the guarantee is a property of the database's
     * foreign keys, so it would silently disappear if Prisma's relationMode ever
     * moved to "prisma", which turns FK enforcement off. The order below has no
     * dependency on either.
     */
    const activities = await tx.candidateActivity.deleteMany({
      where: { candidateId: { in: before.candidateIds } }
    });
    const notes = await tx.candidateNote.deleteMany({
      where: { candidateId: { in: before.candidateIds } }
    });

    // Clearing the job's pointer at its hire before the candidate rows go. The
    // FK is ON DELETE SET NULL and would handle it, but the job row is about to
    // be re-read by the guarded delete below and this keeps that read honest.
    await tx.job.update({ where: { id: job.id }, data: { selectedCandidateId: null } });

    const candidates = await tx.candidate.deleteMany({ where: { jobId: job.id } });
    const importSessions = await tx.importSession.deleteMany({ where: { jobId: job.id } });

    /*
     * The job itself, still guarded on CLOSED.
     *
     * Closure is terminal in this product — there is no reopen route — so the
     * status cannot have changed under us. The guard costs nothing and means the
     * one statement that destroys the job is itself conditional on the rule,
     * rather than trusting a check made earlier in the transaction.
     */
    const removed = await tx.job.deleteMany({ where: { id: job.id, status: 'CLOSED' } });

    if (removed.count !== 1) {
      throw new JobDeletionError('JOB_NOT_CLOSED', 'This job is no longer eligible for deletion.', 409);
    }

    return {
      job: { id: job.id, title: job.title, closedAt: job.closedAt },
      deleted: {
        jobs: removed.count,
        candidates: candidates.count,
        candidateNotes: notes.count,
        candidateActivities: activities.count,
        importSessions: importSessions.count,
        storedResumes: before.storedResumes,
        jobDescriptions: 1
      },
      storage: {
        // Resume bytes are a Postgres column, so removing the rows is what frees
        // the space. Reported so the figure is a measurement, not a claim.
        resumeBytesReleased: before.resumeBytes,
        storedResumesRemoved: before.storedResumes
      },
      external: {
        /*
         * Nothing of the user's own is touched. Outlook-sourced candidates never
         * had their bytes copied here in the first place, so there is no local
         * copy to remove and — importantly — no reason for this operation to
         * reach into a mailbox. The original emails are left exactly as they are.
         */
        outlookSourcedCandidates: before.outlookSourced,
        mailboxOriginalsDeleted: 0
      }
    };
  });

  /*
   * The deletion record.
   *
   * Every audit trail this job had lived in CandidateActivity rows keyed to its
   * candidates, so the history went with them — which is the point of a
   * permanent delete, but it means the fact of the deletion would otherwise
   * leave no trace at all. There is no system-level audit table in this schema
   * to write to, and adding one is a schema change rather than something to
   * introduce as a side effect of this feature, so the evidence is a structured
   * server log line: what was destroyed, how much of it, and who asked.
   */
  console.warn(
    `[JobDeletion] JOB_PERMANENTLY_DELETED job="${summary.job.title}" id=${summary.job.id} ` +
      `candidates=${summary.deleted.candidates} notes=${summary.deleted.candidateNotes} ` +
      `activities=${summary.deleted.candidateActivities} resumes=${summary.deleted.storedResumes} ` +
      `bytes=${summary.storage.resumeBytesReleased} ` +
      `actor=${actor && actor.email ? actor.email : 'unknown'} at=${new Date().toISOString()}`
  );

  return summary;
};

/**
 * What deleting this job would destroy, without destroying it.
 *
 * The confirmation dialog states real figures rather than adjectives, and those
 * figures have to come from the same measurement the deletion itself reports —
 * a dialog that says "23 notes" while the deletion removes a different number
 * would be worse than saying nothing. Read-only.
 *
 * @param {string} jobId
 * @returns {Promise<Object>}
 * @throws {JobDeletionError} JOB_NOT_FOUND, JOB_NOT_CLOSED
 */
const previewJobDeletion = async (jobId) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, title: true, status: true, closedAt: true }
  });

  if (!job) {
    throw new JobDeletionError('JOB_NOT_FOUND', 'Job not found.', 404);
  }

  if (job.status !== 'CLOSED') {
    throw new JobDeletionError(
      'JOB_NOT_CLOSED',
      'Only a closed job can be permanently deleted. Close this job first.',
      409
    );
  }

  const measured = await measure(prisma, job.id);

  return {
    job: { id: job.id, title: job.title, closedAt: job.closedAt },
    counts: {
      candidates: measured.candidates,
      notes: measured.notes,
      activities: measured.activities,
      importSessions: measured.importSessions,
      storedResumes: measured.storedResumes
    },
    storage: { resumeBytes: measured.resumeBytes },
    external: { outlookSourcedCandidates: measured.outlookSourced }
  };
};

module.exports = { deleteClosedJob, previewJobDeletion, JobDeletionError };
