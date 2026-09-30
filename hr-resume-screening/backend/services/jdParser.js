const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');

/**
 * Normalizes raw text extracted from job description files.
 * @param {string} text
 * @returns {string}
 */
const normalizeText = (text) => {
  if (!text) return '';
  return text
    // Replace CRLF and CR with LF
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Replace tabs and multiple spaces on a line with a single space
    .replace(/[ \t]+/g, ' ')
    // Replace 3 or more consecutive newlines with 2 newlines
    .replace(/\n{3,}/g, '\n\n')
    // Trim each individual line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim();
};

/**
 * Extracts readable text from an uploaded JD file buffer.
 * @param {Object} file - Multer file object with buffer, mimetype, and originalname
 * @returns {Promise<string>}
 */
const extractJDText = async (file) => {
  if (!file || !file.buffer) {
    throw new Error('No file buffer provided for JD text extraction.');
  }

  const mimeType = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  let rawText = '';

  try {
    if (ext === '.pdf' || mimeType === 'application/pdf') {
      const pdfData = await pdfParse(file.buffer);
      rawText = pdfData.text || '';
    } else if (
      ext === '.docx' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/docx'
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      rawText = result.value || '';
    } else if (
      ext === '.txt' ||
      mimeType === 'text/plain' ||
      mimeType.startsWith('text/')
    ) {
      rawText = file.buffer.toString('utf-8');
    } else if (ext === '.doc') {
      throw new Error('Unsupported legacy Word format (.doc). Please save as .docx or .pdf.');
    } else {
      throw new Error(`Unsupported JD file type: ${file.originalname || 'file'}. Only PDF, DOCX, and TXT are supported.`);
    }
  } catch (err) {
    if (
      err.message.includes('Unsupported legacy Word format') ||
      err.message.startsWith('Unsupported JD file type')
    ) {
      throw err;
    }
    throw new Error(`Failed to parse file "${file.originalname}": ${err.message}`);
  }

  const cleanedText = normalizeText(rawText);

  if (!cleanedText) {
    throw new Error('Extracted Job Description text is empty or contains no readable characters.');
  }

  return cleanedText;
};

module.exports = {
  extractJDText,
  normalizeText
};
