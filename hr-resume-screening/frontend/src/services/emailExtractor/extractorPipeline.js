/**
 * Normalized Extraction Pipeline.
 *
 * Coordinates:
 * Ingestion -> Format Detection -> Email Parsing -> Metadata & Attachment Extraction ->
 * Classification -> Content Hashing -> Content-based Deduplication -> Safe Filename Allocation
 */

import { parseEmlBuffer } from './parseEml.js';
import { parseMsgBuffer } from './parseMsg.js';
import { classifyAttachment } from './classifyAttachment.js';
import { calculateSha256 } from './hashAttachment.js';
import { getCollisionSafeFileName } from './safeFileName.js';
import { CLASSIFICATIONS, LIMITS } from './constants.js';

/**
 * Normalizes and processes a batch of email Files.
 *
 * @param {File[]} emailFiles Array of .eml / .msg File objects
 * @param {Object} [options]
 * @param {Function} [options.onProgress] Callback with { current, total, percentage, currentEmailName }
 * @param {string} [options.sourceType='drag-drop']
 * @returns {Promise<{
 *   emails: Array<Object>,
 *   resumes: Array<Object>,
 *   duplicates: Array<Object>,
 *   ignored: Array<Object>,
 *   metrics: {
 *     emailsChecked: number,
 *     resumesFound: number,
 *     duplicatesCount: number,
 *     couldNotAccessCount: number,
 *     noAttachmentsCount: number,
 *     otherAttachmentsCount: number,
 *     ignoredInlineCount: number
 *   },
 *   warnings: Array<string>
 * }>}
 */
export async function processEmailBatch(emailFiles, options = {}) {
  const { onProgress, sourceType = 'drag-drop' } = options;

  const totalFiles = Math.min(emailFiles.length, LIMITS.MAX_EMAIL_COUNT);
  const emails = [];
  const allAttachments = [];
  const warnings = [];

  let batchBytes = 0;
  for (let i = 0; i < totalFiles; i++) {
    batchBytes += emailFiles[i]?.size || 0;
  }

  if (batchBytes > LIMITS.MAX_BATCH_BYTES) {
    warnings.push(
      `Batch size (${Math.round(batchBytes / 1024 / 1024)}MB) is large. Processing may take longer.`
    );
  }

  // 1. Process emails sequentially or in small async chunks to keep UI responsive
  for (let i = 0; i < totalFiles; i++) {
    const file = emailFiles[i];
    const currentNum = i + 1;

    if (onProgress) {
      onProgress({
        current: currentNum,
        total: totalFiles,
        percentage: Math.round((currentNum / totalFiles) * 100),
        currentEmailName: file.name
      });
    }

    // Yield control to UI thread every iteration to prevent UI freeze
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Size safeguard
    if (file.size > LIMITS.MAX_SINGLE_EMAIL_BYTES) {
      emails.push({
        id: `email-err-${i}-${Date.now()}`,
        subject: file.name,
        senderName: 'Unknown',
        senderEmail: '',
        sentAt: '',
        sourceType,
        sourceFileName: file.name,
        attachments: [],
        parseStatus: 'ERROR',
        parseError: `This email is too large to process in the browser (${Math.round(file.size / 1024 / 1024)}MB > ${Math.round(LIMITS.MAX_SINGLE_EMAIL_BYTES / 1024 / 1024)}MB limit).`
      });
      continue;
    }

    try {
      const buffer = await file.arrayBuffer();
      const lowerName = file.name.toLowerCase();
      let parsedEmail;

      if (lowerName.endsWith('.msg') || file.type.includes('outlook') || file.type.includes('ms-msg')) {
        parsedEmail = await parseMsgBuffer(buffer, {
          fileName: file.name,
          sourceType,
          depth: 0
        });
      } else {
        // Default to EML
        parsedEmail = await parseEmlBuffer(buffer, {
          fileName: file.name,
          sourceType,
          depth: 0
        });
      }

      emails.push(parsedEmail);

      if (parsedEmail.attachments && parsedEmail.attachments.length > 0) {
        for (const att of parsedEmail.attachments) {
          allAttachments.push({
            ...att,
            subject: parsedEmail.subject,
            senderName: parsedEmail.senderName,
            senderEmail: parsedEmail.senderEmail,
            sourceFileName: file.name
          });
        }
      }
    } catch (parseErr) {
      emails.push({
        id: `email-err-${i}-${Date.now()}`,
        subject: file.name,
        senderName: 'Unknown',
        senderEmail: '',
        sentAt: '',
        sourceType,
        sourceFileName: file.name,
        attachments: [],
        parseStatus: 'ERROR',
        parseError: parseErr.message || 'Could not read email file.'
      });
    }
  }

  // 2. Classify and hash attachments
  const classifiedAttachments = [];
  for (const rawAtt of allAttachments) {
    const classificationResult = classifyAttachment(rawAtt);
    const hash = await calculateSha256(rawAtt.bytes);

    classifiedAttachments.push({
      ...rawAtt,
      classification: classificationResult.classification,
      isResume: classificationResult.isResume,
      reason: classificationResult.reason,
      isProtected: classificationResult.isProtected,
      contentHash: hash,
      duplicateOf: null,
      safeFileName: rawAtt.originalFileName,
      selected: classificationResult.isResume, // Default-selected if RESUME or POSSIBLE_RESUME
      extractionStatus: 'READY'
    });
  }

  // 3. Deduplicate based on content hash and allocate collision-safe filenames
  const seenHashes = new Map(); // hash -> first item id
  const usedFileNames = new Set();
  const resumes = [];
  const duplicates = [];
  const ignored = [];

  for (const item of classifiedAttachments) {
    // If not a resume (e.g. signature image, logo, tracking pixel, calendar)
    if (!item.isResume) {
      ignored.push(item);
      continue;
    }

    // Check for duplicate by content hash
    if (item.contentHash && seenHashes.has(item.contentHash)) {
      const originalId = seenHashes.get(item.contentHash);
      item.duplicateOf = originalId;
      item.selected = false;
      duplicates.push(item);
      continue;
    }

    if (item.contentHash) {
      seenHashes.set(item.contentHash, item.id);
    }

    // Allocate collision-safe unique filename for different files
    const safeName = getCollisionSafeFileName(item.originalFileName, usedFileNames);
    usedFileNames.add(safeName);
    item.safeFileName = safeName;

    resumes.push(item);
  }

  // 4. Calculate metrics
  let couldNotAccessCount = 0;
  let noAttachmentsCount = 0;

  for (const em of emails) {
    if (em.parseStatus === 'ERROR') {
      couldNotAccessCount += 1;
    } else if (!em.attachments || em.attachments.length === 0) {
      noAttachmentsCount += 1;
    }
  }

  const metrics = {
    emailsChecked: emails.length,
    resumesFound: resumes.length,
    duplicatesCount: duplicates.length,
    couldNotAccessCount,
    noAttachmentsCount,
    otherAttachmentsCount: ignored.filter((i) => i.classification === CLASSIFICATIONS.OTHER_ATTACHMENT).length,
    ignoredInlineCount: ignored.filter((i) => i.classification === CLASSIFICATIONS.IGNORED_INLINE).length
  };

  return {
    emails,
    resumes,
    duplicates,
    ignored,
    metrics,
    warnings
  };
}
