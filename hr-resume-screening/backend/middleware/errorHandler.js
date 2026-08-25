const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Maps known Prisma error codes onto HTTP responses with messages that are safe
 * to show a recruiter. Raw Prisma text embeds query fragments and absolute file
 * paths, so it is never forwarded to the client.
 */
const PRISMA_ERRORS = {
  P2002: { status: 409, code: 'DUPLICATE_RECORD', message: 'A record with these unique details already exists.' },
  P2003: { status: 400, code: 'INVALID_REFERENCE', message: 'The referenced record does not exist.' },
  P2023: { status: 400, code: 'INVALID_ID', message: 'The supplied identifier is not valid.' },
  P2025: { status: 404, code: 'RECORD_NOT_FOUND', message: 'The requested record could not be found.' }
};

/**
 * Global Error Handling Middleware for Express & Prisma ORM
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || (res.statusCode >= 400 ? res.statusCode : 500);
  let message = err.expose === false ? 'Internal Server Error' : err.message || 'Internal Server Error';
  let errorCode = err.code || null;

  // Multer upload errors (file too large, unexpected field, bad type)
  if (err.name === 'MulterError') {
    statusCode = 400;
    errorCode = err.code;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum allowed size is 5 MB.'
        : `File upload error: ${err.message}`;
  }

  if (err.code === 'UNSUPPORTED_FILE_TYPE') {
    statusCode = 400;
  }

  // Known Prisma failures
  const prismaMapping = PRISMA_ERRORS[err.code];
  if (prismaMapping) {
    statusCode = prismaMapping.status;
    errorCode = prismaMapping.code;
    message = prismaMapping.message;
  }

  // Prisma validation errors carry the full generated query in the message.
  if (err.name === 'PrismaClientValidationError') {
    statusCode = 400;
    errorCode = 'INVALID_QUERY';
    message = 'The request contained invalid parameters.';
  }

  if (err.name === 'PrismaClientInitializationError' || err.name === 'PrismaClientRustPanicError') {
    statusCode = 503;
    errorCode = 'DATABASE_UNAVAILABLE';
    message = 'The database is currently unavailable. Please try again shortly.';
  }

  // Catch-all for any Prisma error the branches above did not name — most often
  // PrismaClientUnknownRequestError, which a driver-level rejection produces (an
  // identifier containing a NUL byte, for instance). Its message embeds the
  // generated query and the absolute path of the calling file, and without this
  // it was forwarded to the client verbatim outside production, contradicting
  // the invariant stated at the top of this file. The status is left alone: an
  // unnamed Prisma fault is not something to reclassify on a guess.
  if (typeof err.name === 'string' && err.name.startsWith('PrismaClient') && message === err.message) {
    errorCode = errorCode || 'DATABASE_ERROR';
    message = 'The request could not be completed. Please check the supplied values and try again.';
  }

  if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    errorCode = 'MALFORMED_JSON';
    message = 'Request body is not valid JSON.';
  }

  if (statusCode >= 500) {
    // Log the real cause server-side; return something generic to the client.
    console.error(`[Error] ${req.method} ${req.originalUrl} -> ${statusCode}:`, err.message);
    if (!isProduction() && err.stack) console.error(err.stack);
    if (isProduction()) message = 'An unexpected server error occurred. Please try again.';
  }

  return res.status(statusCode).json({
    success: false,
    code: errorCode,
    message,
    // Stack traces are development-only and never reach a production client.
    ...(!isProduction() && statusCode >= 500 && err.stack ? { stack: err.stack } : {})
  });
};

/**
 * 404 Not Found Route Handler
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = 'ROUTE_NOT_FOUND';
  next(error);
};

module.exports = {
  errorHandler,
  notFound
};
