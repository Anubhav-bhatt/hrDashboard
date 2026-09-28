/**
 * Deterministic rules-based attachment classification.
 *
 * Distinguishes resumes from signature images, logos, tracking pixels,
 * calendar invites, and general document attachments without needing AI.
 */

import {
  SUPPORTED_RESUME_EXTENSIONS,
  IMAGE_EXTENSIONS,
  CALENDAR_EXTENSIONS,
  CLASSIFICATIONS,
  RESUME_FILENAME_KEYWORDS
} from './constants.js';

const SIGNATURE_NAME_PATTERNS = [
  /^image\d{3,}/i,
  /^logo/i,
  /logo/i,
  /^signature/i,
  /signature/i,
  /^banner/i,
  /^footer/i,
  /^header/i,
  /^icon/i,
  /^avatar/i,
  /^badge/i,
  /^social/i,
  /^linkedin/i,
  /^twitter/i,
  /^facebook/i,
  /^instagram/i,
  /^spacer/i,
  /^pixel/i
];

/**
 * Checks if a byte buffer has basic file signature / magic bytes.
 * @param {Uint8Array|ArrayBuffer} data
 * @param {string} ext
 * @returns {{ valid: boolean, isProtected: boolean, error?: string }}
 */
export function checkFileSignature(data, ext) {
  if (!data || data.byteLength === 0) {
    return { valid: false, isProtected: false, error: 'Zero-byte empty file' };
  }

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (ext === '.pdf') {
    // PDF magic bytes: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    if (bytes.length >= 5) {
      const header = String.fromCharCode(...bytes.slice(0, 5));
      if (header.startsWith('%PDF')) {
        // Quick scan of first 2048 bytes for /Encrypt dictionary
        const checkWindow = Math.min(bytes.length, 4096);
        const ascii = String.fromCharCode(...bytes.slice(0, checkWindow));
        const isEncrypted = ascii.includes('/Encrypt');
        return { valid: true, isProtected: isEncrypted };
      }
    }
    return { valid: true, isProtected: false };
  }

  if (ext === '.docx') {
    // DOCX (ZIP archive): PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    if (bytes.length >= 4) {
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        return { valid: true, isProtected: false };
      }
    }
  }

  if (ext === '.doc') {
    // Legacy DOC (OLE/CFBF): 0xD0 0xCF 0x11 0xE0
    if (bytes.length >= 4) {
      if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
        return { valid: true, isProtected: false };
      }
    }
  }

  return { valid: true, isProtected: false };
}

/**
 * Classifies an email attachment deterministically.
 *
 * @param {Object} attachment
 * @param {string} attachment.originalFileName
 * @param {string} [attachment.mimeType]
 * @param {number} attachment.size
 * @param {boolean} [attachment.isInline]
 * @param {string} [attachment.disposition]
 * @param {string} [attachment.contentId]
 * @param {Uint8Array|ArrayBuffer} [attachment.bytes]
 * @returns {{
 *   classification: string,
 *   isResume: boolean,
 *   reason: string,
 *   extension: string,
 *   isProtected: boolean
 * }}
 */
export function classifyAttachment(attachment) {
  const fileName = (attachment.originalFileName || '').trim();
  const lowerName = fileName.toLowerCase();
  const lastDot = lowerName.lastIndexOf('.');
  const ext = lastDot >= 0 ? lowerName.slice(lastDot) : '';
  const size = attachment.size || 0;
  const isInline = Boolean(
    attachment.isInline ||
    attachment.disposition === 'inline' ||
    (attachment.contentId && attachment.contentId.length > 0)
  );
  const mimeType = (attachment.mimeType || '').toLowerCase();

  // 1. Zero-byte check
  if (size === 0) {
    return {
      classification: CLASSIFICATIONS.OTHER_ATTACHMENT,
      isResume: false,
      reason: 'Empty file (0 bytes)',
      extension: ext,
      isProtected: false
    };
  }

  // 2. Calendar files (.ics, .vcf)
  if (CALENDAR_EXTENSIONS.includes(ext) || mimeType.includes('calendar') || mimeType.includes('vcard')) {
    return {
      classification: CLASSIFICATIONS.OTHER_ATTACHMENT,
      isResume: false,
      reason: 'Calendar or contact card',
      extension: ext,
      isProtected: false
    };
  }

  // 3. Inline images, signatures, logos
  const isImageExt = IMAGE_EXTENSIONS.includes(ext) || mimeType.startsWith('image/');
  const matchesSignaturePattern = SIGNATURE_NAME_PATTERNS.some((pattern) => pattern.test(lowerName));

  if (isImageExt) {
    if (isInline || matchesSignaturePattern || size < 40 * 1024) {
      return {
        classification: CLASSIFICATIONS.IGNORED_INLINE,
        isResume: false,
        reason: 'Inline email image / signature / logo',
        extension: ext,
        isProtected: false
      };
    }

    return {
      classification: CLASSIFICATIONS.OTHER_ATTACHMENT,
      isResume: false,
      reason: 'Image file (not a resume)',
      extension: ext,
      isProtected: false
    };
  }

  // 4. Resume supported extensions
  if (SUPPORTED_RESUME_EXTENSIONS.includes(ext)) {
    // Check file integrity
    let isProtected = false;
    if (attachment.bytes) {
      const sigCheck = checkFileSignature(attachment.bytes, ext);
      if (sigCheck.isProtected) {
        isProtected = true;
      }
    }

    // Keyword detection
    const hasResumeKeyword = RESUME_FILENAME_KEYWORDS.some((kw) => lowerName.includes(kw));

    if (hasResumeKeyword) {
      return {
        classification: CLASSIFICATIONS.RESUME,
        isResume: true,
        reason: isProtected ? 'Resume document (password-protected)' : 'Matches resume naming pattern',
        extension: ext,
        isProtected
      };
    }

    // Even without explicit keyword, standard document formats (PDF, DOCX, DOC)
    // with reasonable resume size (> 2KB) are high-confidence candidate resumes
    if (['.pdf', '.docx', '.doc'].includes(ext)) {
      if (size >= 1500) {
        return {
          classification: CLASSIFICATIONS.RESUME,
          isResume: true,
          reason: isProtected ? 'Candidate document (password-protected)' : 'Candidate document attachment',
          extension: ext,
          isProtected
        };
      }
      return {
        classification: CLASSIFICATIONS.POSSIBLE_RESUME,
        isResume: true,
        reason: 'Small document file',
        extension: ext,
        isProtected
      };
    }

    // .rtf, .odt, .txt
    return {
      classification: CLASSIFICATIONS.POSSIBLE_RESUME,
      isResume: true,
      reason: 'Supported text/document format',
      extension: ext,
      isProtected
    };
  }

  // 5. Other file formats (zip, spreadsheets, presentations, code, etc.)
  return {
    classification: CLASSIFICATIONS.OTHER_ATTACHMENT,
    isResume: false,
    reason: `Non-resume format (${ext || 'unknown'})`,
    extension: ext,
    isProtected: false
  };
}
