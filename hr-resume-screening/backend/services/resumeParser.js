const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');
const { normalizeText } = require('./jdParser');

/**
 * Extracts readable text from a candidate resume Buffer strictly in memory.
 * No files are written to disk.
 *
 * @param {Object} params - { buffer, mimeType, fileName }
 * @returns {Promise<{ text: string, characterCount: number, fileType: string }>}
 */
const extractResumeText = async ({ buffer, mimeType = '', fileName = '' }) => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Invalid or empty buffer provided for resume parsing.');
  }

  const ext = path.extname(fileName || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  let rawText = '';
  let fileType = 'unknown';

  try {
    if (ext === '.pdf' || lowerMime === 'application/pdf') {
      fileType = 'pdf';
      const pdfData = await pdfParse(buffer);
      rawText = pdfData.text || '';
    } else if (
      ext === '.docx' ||
      lowerMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerMime === 'application/docx'
    ) {
      fileType = 'docx';
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value || '';
    } else if (ext === '.txt' || lowerMime === 'text/plain') {
      fileType = 'txt';
      rawText = buffer.toString('utf-8');
    } else if (ext === '.doc') {
      throw new Error('Unsupported legacy Word format (.doc). Please submit .docx or .pdf.');
    } else {
      throw new Error(`Unsupported resume format: ${fileName || 'file'}`);
    }
  } catch (err) {
    if (
      err.message.includes('Unsupported legacy Word') ||
      err.message.includes('Unsupported resume format')
    ) {
      throw err;
    }
    throw new Error(`Failed to parse resume "${fileName}": ${err.message}`);
  }

  const cleanedText = normalizeText(rawText);
  const minLength = parseInt(process.env.MIN_RESUME_TEXT_LENGTH || '100', 10);

  if (!cleanedText || cleanedText.length < minLength) {
    throw new Error(
      `SCANNED_DOCUMENT_UNSUPPORTED: Unable to extract minimum readable text from "${fileName}". File may be a scanned image PDF.`
    );
  }

  return {
    text: cleanedText,
    characterCount: cleanedText.length,
    fileType
  };
};

module.exports = {
  extractResumeText
};
