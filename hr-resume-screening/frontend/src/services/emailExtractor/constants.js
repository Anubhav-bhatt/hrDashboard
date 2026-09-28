/**
 * Constants and limits for Outlook Bulk Email Resume Extractor.
 *
 * Designed for pure browser-local execution with strict privacy guarantees:
 * no backend upload, no cloud storage, no database persistence.
 */

export const SUPPORTED_RESUME_EXTENSIONS = ['.pdf', '.doc', '.docx', '.rtf', '.odt', '.txt'];

export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.bmp',
  '.ico',
  '.webp'
];

export const CALENDAR_EXTENSIONS = ['.ics', '.vcf'];

export const CLASSIFICATIONS = {
  RESUME: 'RESUME',
  POSSIBLE_RESUME: 'POSSIBLE_RESUME',
  OTHER_ATTACHMENT: 'OTHER_ATTACHMENT',
  IGNORED_INLINE: 'IGNORED_INLINE'
};

export const RESUME_FILENAME_KEYWORDS = [
  'resume',
  'cv',
  'curriculum',
  'vitae',
  'profile',
  'candidate',
  'application',
  'applicant',
  'biodata',
  'bio',
  'summary'
];

export const MAX_NESTED_EMAIL_DEPTH = 2;

// Safety safeguards to prevent browser tab crashes on gigantic files
export const LIMITS = {
  MAX_SINGLE_EMAIL_BYTES: 50 * 1024 * 1024, // 50MB
  MAX_BATCH_BYTES: 250 * 1024 * 1024,        // 250MB
  MAX_ATTACHMENT_BYTES: 35 * 1024 * 1024,    // 35MB
  MAX_EMAIL_COUNT: 500
};
