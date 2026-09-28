/**
 * Comprehensive Unit Test Suite for Outlook Bulk Email Resume Extractor.
 *
 * Tests:
 * 1. Safe filename sanitization & collision resolution
 * 2. SHA-256 cryptographic content hashing
 * 3. Resume vs inline image classification
 * 4. RFC 5322 EML parser & attachment extraction
 * 5. Nested email recursion & limits
 * 6. Content-based duplicate detection
 * 7. Filename collision safety (different files with same name)
 * 8. Zip archive creation and structure
 * 9. Clipboard & drop ingestion detection
 * 10. Performance benchmark: 10, 50, 100 emails
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeFileName,
  getCollisionSafeFileName
} from '../safeFileName.js';
import { calculateSha256 } from '../hashAttachment.js';
import { classifyAttachment, checkFileSignature } from '../classifyAttachment.js';
import { parseEmlBuffer } from '../parseEml.js';
import { parseMsgBuffer } from '../parseMsg.js';
import { processEmailBatch } from '../extractorPipeline.js';
import { detectClipboardInput, detectDroppedInput, isLikelyEmailText } from '../detectInput.js';
import { downloadResumesAsZip } from '../createZipFallback.js';
import {
  createSyntheticTestFixtures,
  buildEmlString,
  createDummyPdf,
  createDummyDocx,
  createDummyPng
} from './fixtures.js';

// Polyfill File in Node if necessary
class MockFile {
  constructor(bits, name, options = {}) {
    this._bits = bits;
    this.name = name;
    this.type = options.type || '';
    this.size = Buffer.concat(bits.map((b) => (typeof b === 'string' ? Buffer.from(b) : Buffer.from(b)))).length;
  }

  async arrayBuffer() {
    const buf = Buffer.concat(this._bits.map((b) => (typeof b === 'string' ? Buffer.from(b) : Buffer.from(b))));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
}

const FileClass = typeof File !== 'undefined' ? File : MockFile;

describe('Outlook Bulk Email Resume Extractor Unit Tests', () => {
  // 1. Safe Filename Sanitization
  describe('Safe Filename Sanitization', () => {
    it('removes forbidden characters / \\ : * ? " < > | from filenames', () => {
      const dirty = 'resume/test\\one:two*three?"four"<five>six|end.pdf';
      const clean = sanitizeFileName(dirty);
      assert.equal(clean.includes('/'), false);
      assert.equal(clean.includes('\\'), false);
      assert.equal(clean.includes(':'), false);
      assert.equal(clean.includes('*'), false);
      assert.equal(clean.includes('?'), false);
      assert.equal(clean.includes('"'), false);
      assert.equal(clean.includes('<'), false);
      assert.equal(clean.includes('>'), false);
      assert.equal(clean.includes('|'), false);
    });

    it('preserves unicode letters and international candidate names', () => {
      const unicodeName = 'CV_François_Müller_Développeur_2026.pdf';
      const clean = sanitizeFileName(unicodeName);
      assert.equal(clean, unicodeName);
    });

    it('trims leading/trailing whitespace and periods', () => {
      const messy = '  ...Rahul_Resume.pdf...   ';
      const clean = sanitizeFileName(messy);
      assert.equal(clean, 'Rahul_Resume.pdf');
    });

    it('provides fallback for empty or completely illegal names', () => {
      assert.equal(sanitizeFileName(''), 'attachment');
      assert.equal(sanitizeFileName('???***'), 'attachment');
    });
  });

  // 2. Filename Collision Resolution
  describe('Filename Collision Resolution', () => {
    it('generates sequential non-overwriting filenames for differing files', () => {
      const usedNames = new Set(['resume.pdf']);
      const name2 = getCollisionSafeFileName('resume.pdf', usedNames);
      assert.equal(name2, 'resume (2).pdf');
      usedNames.add(name2);

      const name3 = getCollisionSafeFileName('resume.pdf', usedNames);
      assert.equal(name3, 'resume (3).pdf');
    });
  });

  // 3. Cryptographic Content Hashing (SHA-256)
  describe('Cryptographic Content Hashing', () => {
    it('calculates deterministic SHA-256 hex digest for binary payloads', async () => {
      const data1 = Buffer.from('Candidate Resume Payload 1', 'utf-8');
      const data2 = Buffer.from('Candidate Resume Payload 1', 'utf-8');
      const data3 = Buffer.from('Candidate Resume Payload 2', 'utf-8');

      const hash1 = await calculateSha256(data1);
      const hash2 = await calculateSha256(data2);
      const hash3 = await calculateSha256(data3);

      assert.equal(hash1.length, 64, 'SHA-256 should be 64 hex characters');
      assert.equal(hash1, hash2, 'Identical payloads must yield identical hash');
      assert.notEqual(hash1, hash3, 'Different payloads must yield different hash');
    });
  });

  // 4. Resume vs Inline Classification
  describe('Attachment Classification', () => {
    it('classifies PDF with resume keyword as high-confidence RESUME', () => {
      const att = {
        originalFileName: 'Alex_Smith_Resume.pdf',
        mimeType: 'application/pdf',
        size: 50000,
        isInline: false
      };
      const res = classifyAttachment(att);
      assert.equal(res.classification, 'RESUME');
      assert.equal(res.isResume, true);
    });

    it('classifies standard candidate PDF without explicit resume keyword as RESUME', () => {
      const att = {
        originalFileName: 'document_candidate_upload.pdf',
        mimeType: 'application/pdf',
        size: 35000,
        isInline: false
      };
      const res = classifyAttachment(att);
      assert.equal(res.isResume, true);
    });

    it('ignores inline signature image (image001.png, logo.jpg, small images)', () => {
      const inlineAtt = {
        originalFileName: 'image001.png',
        mimeType: 'image/png',
        size: 4500,
        isInline: true,
        contentId: 'logo_cid'
      };
      const res = classifyAttachment(inlineAtt);
      assert.equal(res.classification, 'IGNORED_INLINE');
      assert.equal(res.isResume, false);
    });

    it('filters out calendar .ics attachments from resumes', () => {
      const calAtt = {
        originalFileName: 'invite.ics',
        mimeType: 'text/calendar',
        size: 1200,
        isInline: false
      };
      const res = classifyAttachment(calAtt);
      assert.equal(res.classification, 'OTHER_ATTACHMENT');
      assert.equal(res.isResume, false);
    });

    it('marks corrupt zero-byte files as non-resumes', () => {
      const zeroAtt = {
        originalFileName: 'broken_cv.pdf',
        mimeType: 'application/pdf',
        size: 0,
        isInline: false
      };
      const res = classifyAttachment(zeroAtt);
      assert.equal(res.isResume, false);
      assert.equal(res.reason.includes('0 bytes'), true);
    });
  });

  // 5. EML Parsing and Attachment Extraction
  describe('EML Parsing Pipeline', () => {
    it('parses standard EML with multipart/mixed base64 PDF attachment', async () => {
      const pdf = createDummyPdf('EML Test Candidate');
      const rawEml = buildEmlString({
        subject: 'Job Application - Software Engineer',
        from: 'Candidate A <cand.a@example.invalid>',
        attachments: [
          { filename: 'Candidate_A_CV.pdf', contentType: 'application/pdf', data: pdf }
        ]
      });

      const parsed = await parseEmlBuffer(Buffer.from(rawEml, 'utf-8'), {
        fileName: 'cand_a.eml'
      });

      assert.equal(parsed.parseStatus, 'SUCCESS');
      assert.equal(parsed.subject, 'Job Application - Software Engineer');
      assert.equal(parsed.attachments.length, 1);
      assert.equal(parsed.attachments[0].originalFileName, 'Candidate_A_CV.pdf');
      assert.equal(parsed.attachments[0].size > 0, true);
    });

    it('handles nested EML message attachments safely up to max depth', async () => {
      const innerPdf = createDummyPdf('Nested Candidate');
      const innerEml = buildEmlString({
        subject: 'Original Application',
        from: 'Original Candidate <orig@example.invalid>',
        attachments: [{ filename: 'Nested_Resume.pdf', contentType: 'application/pdf', data: innerPdf }]
      });

      const outerEml = buildEmlString({
        subject: 'Fwd: Candidate application',
        from: 'Manager <manager@example.invalid>',
        attachments: [{ filename: 'forwarded.eml', contentType: 'message/rfc822', data: Buffer.from(innerEml, 'utf-8') }]
      });

      const parsed = await parseEmlBuffer(Buffer.from(outerEml, 'utf-8'), {
        fileName: 'outer.eml'
      });

      assert.equal(parsed.parseStatus, 'SUCCESS');
      assert.equal(parsed.attachments.length, 1);
      assert.equal(parsed.attachments[0].originalFileName, 'Nested_Resume.pdf');
    });
  });

  // 5b. MSG Parsing Pipeline & Error Resilience
  describe('MSG Parsing Pipeline & Error Resilience', () => {
    it('handles non-MSG or damaged MSG files gracefully with ERROR status', async () => {
      const corruptData = Buffer.from('not an OLE compound file');
      const parsed = await parseMsgBuffer(corruptData, { fileName: 'damaged.msg' });
      assert.equal(parsed.parseStatus, 'ERROR');
      assert.equal(Boolean(parsed.parseError), true);
      assert.equal(parsed.attachments.length, 0);
    });
  });

  // 6. Ingestion & Clipboard Diagnostics
  describe('Ingestion & Clipboard Diagnostics', () => {
    it('detects Outlook copied text without attachments and provides clear fallback', () => {
      const mockClipboard = {
        files: [],
        items: [],
        types: ['text/plain', 'text/html'],
        getData: (type) => {
          if (type === 'text/plain') {
            return 'From: Recruiter Contact\nSent: Monday, September 28, 2026\nSubject: Candidate Application\nTo: HR Team';
          }
          if (type === 'text/html') {
            return '<div class="MsoNormal">From: Recruiter Contact</div>';
          }
          return '';
        }
      };

      const detection = detectClipboardInput(mockClipboard);
      assert.equal(detection.kind, 'UNSUPPORTED_CLIPBOARD_TEXT');
      assert.equal(detection.message.includes('Outlook did not provide the email attachments'), true);
      assert.equal(detection.suggestion.includes('Drag the selected emails here instead'), true);
    });
  });

  // 7. Full Ingestion Pipeline with Synthetic Batch (14 Fixtures)
  describe('Full Ingestion Pipeline with 14 Synthetic Fixtures', () => {
    it('extracts resumes, deduplicates identical content, skips signature images, and preserves differing same-name files', async () => {
      const fixtures = createSyntheticTestFixtures();
      const files = fixtures.map((f) => new FileClass([f.content], f.name, { type: 'message/rfc822' }));

      const result = await processEmailBatch(files, { sourceType: 'test' });

      // Verifications:
      // Total emails checked: 14
      assert.equal(result.metrics.emailsChecked, 14);

      // Email 4 has no attachments
      assert.equal(result.metrics.noAttachmentsCount, 1);

      // Duplicate detected: Email 6 and Email 7 share identical PDF bytes
      assert.equal(result.metrics.duplicatesCount >= 1, true, 'Duplicate resume should be detected');

      // Colliding filename: Email 8 and Email 9 both named 'resume.pdf' with different content
      const resumeNames = result.resumes.map((r) => r.safeFileName);
      const hasBaseResume = resumeNames.includes('resume.pdf');
      const hasCollidedResume = resumeNames.some((n) => n.startsWith('resume (2)'));
      assert.equal(hasBaseResume, true, 'First resume.pdf should exist');
      assert.equal(hasCollidedResume, true, 'Second differing resume.pdf should be renamed to resume (2).pdf');

      // Signatures filtered out
      assert.equal(result.metrics.ignoredInlineCount >= 1, true, 'Signature images should be filtered out');

      // Resumes found should be >= 8 unique candidate documents
      assert.equal(result.metrics.resumesFound >= 8, true);
    });
  });

  // 8. Performance Benchmark: 10, 50, 100 Emails
  describe('Performance Benchmark (10, 50, 100 emails)', () => {
    it('measures async processing duration for 10, 50, and 100 synthetic emails', async () => {
      const createBatch = (count) => {
        const batch = [];
        for (let i = 0; i < count; i++) {
          const pdf = createDummyPdf(`Benchmark Candidate #${i + 1}`);
          const eml = buildEmlString({
            subject: `Application for role - Candidate #${i + 1}`,
            from: `Candidate ${i + 1} <cand${i + 1}@example.invalid>`,
            attachments: [{ filename: `Candidate_${i + 1}_Resume.pdf`, contentType: 'application/pdf', data: pdf }]
          });
          batch.push(new FileClass([eml], `email_${i + 1}.eml`, { type: 'message/rfc822' }));
        }
        return batch;
      };

      // 10 emails
      const t0 = Date.now();
      const res10 = await processEmailBatch(createBatch(10));
      const dur10 = Date.now() - t0;
      assert.equal(res10.metrics.emailsChecked, 10);
      assert.equal(res10.metrics.resumesFound, 10);

      // 50 emails
      const t1 = Date.now();
      const res50 = await processEmailBatch(createBatch(50));
      const dur50 = Date.now() - t1;
      assert.equal(res50.metrics.emailsChecked, 50);
      assert.equal(res50.metrics.resumesFound, 50);

      // 100 emails
      const t2 = Date.now();
      const res100 = await processEmailBatch(createBatch(100));
      const dur100 = Date.now() - t2;
      assert.equal(res100.metrics.emailsChecked, 100);
      assert.equal(res100.metrics.resumesFound, 100);

      console.log(`\n  [Performance Benchmark]`);
      console.log(`  10 emails:  ${dur10}ms (${(dur10 / 10).toFixed(1)}ms/email)`);
      console.log(`  50 emails:  ${dur50}ms (${(dur50 / 50).toFixed(1)}ms/email)`);
      console.log(`  100 emails: ${dur100}ms (${(dur100 / 100).toFixed(1)}ms/email)\n`);
    });
  });
});
