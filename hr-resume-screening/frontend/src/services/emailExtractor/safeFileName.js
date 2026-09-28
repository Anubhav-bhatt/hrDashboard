/**
 * Utilities for sanitizing and resolving filename collisions.
 *
 * Rules:
 * - Strip or replace characters forbidden across Windows, macOS and Linux: / \ : * ? " < > |
 * - Remove ASCII and non-printable control characters
 * - Trim whitespace and trailing periods
 * - Preserve readable unicode characters
 * - Never overwrite differing files: if collision occurs, append (2), (3), etc.
 */

const FORBIDDEN_CHARS_REGEX = /[\\/:*?"<>|\x00-\x1F\x7F-\x9F]/g;

/**
 * Sanitizes a filename string to be safe for local filesystem write.
 * @param {string} rawName
 * @param {string} [fallback='attachment']
 * @returns {string}
 */
export function sanitizeFileName(rawName, fallback = 'attachment') {
  if (!rawName || typeof rawName !== 'string') {
    return fallback;
  }

  // Normalize Unicode (NFC)
  let clean = rawName.normalize('NFC');

  // Replace forbidden filesystem characters with underscore
  clean = clean.replace(FORBIDDEN_CHARS_REGEX, '_');

  // Collapse multiple underscores or spaces
  clean = clean.replace(/_+/g, '_').replace(/\s+/g, ' ');

  // Trim whitespace and periods from ends
  clean = clean.trim().replace(/^\.+|\.+$/g, '');

  if (!clean || clean === '.' || /^[_.\s]+$/.test(clean)) {
    return fallback;
  }

  // Maximum safe filename length (255 bytes limit on most filesystems)
  if (clean.length > 200) {
    const extIndex = clean.lastIndexOf('.');
    if (extIndex > 0 && clean.length - extIndex < 10) {
      const ext = clean.slice(extIndex);
      clean = clean.slice(0, 190) + ext;
    } else {
      clean = clean.slice(0, 200);
    }
  }

  return clean;
}

/**
 * Allocates a unique, collision-free filename given a set of already used filenames.
 * If 'Rahul_Resume.pdf' is taken, yields 'Rahul_Resume (2).pdf', 'Rahul_Resume (3).pdf', etc.
 *
 * @param {string} desiredName
 * @param {Set<string>|Map<string, any>} usedNames
 * @returns {string}
 */
export function getCollisionSafeFileName(desiredName, usedNames) {
  const safeBase = sanitizeFileName(desiredName, 'resume.pdf');
  const hasName = (n) => (usedNames instanceof Set ? usedNames.has(n) : usedNames.has ? usedNames.has(n) : Boolean(usedNames[n]));

  if (!hasName(safeBase)) {
    return safeBase;
  }

  const lastDot = safeBase.lastIndexOf('.');
  const baseName = lastDot > 0 ? safeBase.slice(0, lastDot) : safeBase;
  const ext = lastDot > 0 ? safeBase.slice(lastDot) : '';

  let counter = 2;
  while (counter < 10000) {
    const candidate = `${baseName} (${counter})${ext}`;
    if (!hasName(candidate)) {
      return candidate;
    }
    counter += 1;
  }

  // Extreme fallback
  return `${baseName}_${Date.now()}${ext}`;
}
