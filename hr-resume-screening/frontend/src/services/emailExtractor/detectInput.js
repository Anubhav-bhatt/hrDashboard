/**
 * Ingestion and capability detection for Outlook email input.
 *
 * Distinguishes:
 * 1. Actual email files (.msg, .eml) from clipboard or drag/drop
 * 2. Copied Outlook text where the browser/OS withheld attachments (triggers clear fallback)
 * 3. Accidental drops of raw non-email files (e.g. dropping PDF directly)
 */

const EMAIL_EXTENSIONS = ['.msg', '.eml'];
const EMAIL_MIME_TYPES = [
  'message/rfc822',
  'application/vnd.ms-outlook',
  'application/x-msg',
  'application/octet-stream'
];

/**
 * Checks if a File object represents an email message (.msg or .eml).
 * @param {File} file
 * @returns {boolean}
 */
export function isEmailFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  const ext = name.slice(name.lastIndexOf('.'));
  if (EMAIL_EXTENSIONS.includes(ext)) {
    return true;
  }
  if (file.type && EMAIL_MIME_TYPES.includes(file.type.toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * Checks if text or html looks like copied Outlook email content.
 * @param {string} text
 * @param {string} html
 * @returns {boolean}
 */
export function isLikelyEmailText(text = '', html = '') {
  const combined = (text + ' ' + html).toLowerCase();
  const hasHeaders =
    (combined.includes('from:') || combined.includes('sender:')) &&
    (combined.includes('subject:') || combined.includes('date:') || combined.includes('to:'));
  const hasOutlookMarkers =
    combined.includes('mso-') ||
    combined.includes('urn:schemas-microsoft-com:office') ||
    combined.includes('class="msonormal"') ||
    combined.includes('microsoft outlook') ||
    combined.includes('outlook-attachment');

  return hasHeaders || hasOutlookMarkers;
}

/**
 * Inspects a ClipboardEvent dataTransfer/clipboardData.
 *
 * @param {DataTransfer|null} clipboardData
 * @returns {{
 *   kind: 'FILES' | 'UNSUPPORTED_CLIPBOARD_TEXT' | 'EMPTY' | 'NON_EMAIL_FILES',
 *   files?: File[],
 *   message?: string,
 *   suggestion?: string
 * }}
 */
export function detectClipboardInput(clipboardData) {
  if (!clipboardData) {
    return { kind: 'EMPTY' };
  }

  // Safe developer logging of clipboard types without logging PII/data
  if (process.env.NODE_ENV !== 'production') {
    try {
      const types = Array.from(clipboardData.types || []);
      const fileCount = clipboardData.files?.length || 0;
      console.debug('[ResumeExtractor] Clipboard types detected:', types, 'Files:', fileCount);
    } catch {}
  }

  // 1. Inspect actual attached files in clipboard
  const rawFiles = [];
  if (clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      rawFiles.push(clipboardData.files[i]);
    }
  } else if (clipboardData.items) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) rawFiles.push(file);
      }
    }
  }

  if (rawFiles.length > 0) {
    const emailFiles = rawFiles.filter(isEmailFile);
    if (emailFiles.length > 0) {
      return { kind: 'FILES', files: emailFiles };
    }
    return {
      kind: 'NON_EMAIL_FILES',
      message: 'This extractor expects email messages containing attachments.',
      suggestion: 'Drop .msg or .eml email files.'
    };
  }

  // 2. If no files, check for copied email text / HTML
  const text = clipboardData.getData ? clipboardData.getData('text/plain') : '';
  const html = clipboardData.getData ? clipboardData.getData('text/html') : '';

  if (isLikelyEmailText(text, html)) {
    return {
      kind: 'UNSUPPORTED_CLIPBOARD_TEXT',
      message: 'Outlook did not provide the email attachments through the clipboard.',
      suggestion: 'Drag the selected emails here instead, or export them as .msg/.eml files.'
    };
  }

  return { kind: 'EMPTY' };
}

/**
 * Inspects a DragEvent dataTransfer.
 *
 * @param {DataTransfer|null} dataTransfer
 * @returns {Promise<{
 *   kind: 'FILES' | 'NON_EMAIL_FILES' | 'EMPTY',
 *   files?: File[],
 *   message?: string,
 *   suggestion?: string
 * }>}
 */
export async function detectDroppedInput(dataTransfer) {
  if (!dataTransfer) {
    return { kind: 'EMPTY' };
  }

  const rawFiles = [];

  // Check files
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      rawFiles.push(dataTransfer.files[i]);
    }
  } else if (dataTransfer.items) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) rawFiles.push(file);
      }
    }
  }

  if (rawFiles.length === 0) {
    return { kind: 'EMPTY' };
  }

  const emailFiles = rawFiles.filter(isEmailFile);

  if (emailFiles.length > 0) {
    return { kind: 'FILES', files: emailFiles };
  }

  return {
    kind: 'NON_EMAIL_FILES',
    message: 'These files are not Outlook/Email messages.',
    suggestion: 'Drop .msg or .eml email files.'
  };
}

/**
 * Inspects files selected via file input element.
 * @param {FileList|File[]} fileList
 * @returns {{ kind: 'FILES' | 'NON_EMAIL_FILES' | 'EMPTY', files?: File[], message?: string }}
 */
export function detectSelectedFiles(fileList) {
  if (!fileList || fileList.length === 0) {
    return { kind: 'EMPTY' };
  }

  const rawFiles = Array.from(fileList);
  const emailFiles = rawFiles.filter(isEmailFile);

  if (emailFiles.length > 0) {
    return { kind: 'FILES', files: emailFiles };
  }

  return {
    kind: 'NON_EMAIL_FILES',
    message: 'These files are not Outlook/Email messages.',
    suggestion: 'Choose .msg or .eml email files.'
  };
}
