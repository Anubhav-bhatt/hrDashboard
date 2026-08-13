const multer = require('multer');
const path = require('path');

// Configure memory storage - JD files are processed in memory and never persisted to disk
const storage = multer.memoryStorage();

// Allowed MIME types and extensions
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/docx',
  'text/plain'
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mimeType = file.mimetype || '';

  const isExtensionValid = ALLOWED_EXTENSIONS.includes(ext);
  const isMimeValid = ALLOWED_MIME_TYPES.includes(mimeType) || mimeType.startsWith('text/');

  if (isExtensionValid && isMimeValid) {
    return cb(null, true);
  }

  const error = new Error('Unsupported JD file type. Only PDF, DOCX, and TXT files are allowed.');
  error.code = 'UNSUPPORTED_FILE_TYPE';
  return cb(error, false);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB limit
  },
  fileFilter
});

module.exports = upload;
