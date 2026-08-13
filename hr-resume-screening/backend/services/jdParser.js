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

  const mimeType = file.mimetype || '';
  const ext = path.extname(file.originalname || '').toLowerCase();
  let rawText = '';

  try {
    if (mimeType === 'application/pdf' || ext === '.pdf') {
      const pdfData = await pdfParse(file.buffer);
      rawText = pdfData.text || '';
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/docx' ||
      ext === '.docx'
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      rawText = result.value || '';
    } else if (
      mimeType === 'text/plain' ||
      ext === '.txt'
    ) {
      rawText = file.buffer.toString('utf-8');
    } else {
      throw new Error(`Unsupported JD file type: ${file.originalname}`);
    }
  } catch (err) {
    if (err.message.startsWith('Unsupported JD file type')) {
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
