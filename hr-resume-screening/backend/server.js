const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const prisma = require('./config/prisma');

// Load Environment Variables
dotenv.config();

const app = express();

// Behind a reverse proxy the client IP arrives in X-Forwarded-For; rate limiting
// and secure cookies rely on it being interpreted correctly.
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Security Middlewares
app.use(helmet());

// CORS Configuration — the allow list is explicit. Arbitrary origins are never
// reflected back, because the session cookie is sent with credentials.
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = Array.from(
  new Set(
    [
      ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : []),
      ...(process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS)
    ]
      .map((o) => o.trim())
      .filter(Boolean)
  )
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin / server-to-server requests carry no Origin header.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true
  })
);

// Body & Cookie Parsing Middlewares
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Baseline API rate limit. Generous enough for dashboard use, low enough to
// blunt scripted scraping of candidate records.
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.API_RATE_LIMIT || '600', 10),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.path === '/health' ||
      req.path === '/ready' ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/ready'),
    message: {
      success: false,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down and try again shortly.'
    }
  })
);

// Health Check Endpoint (Lightweight, unauthenticated for uptime probes)
const healthHandler = (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    database: 'PostgreSQL (Prisma ORM)',
    timestamp: new Date().toISOString()
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Readiness Check Endpoint (Verifies PostgreSQL connectivity without external AI dependencies)
const readyHandler = async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      success: true,
      status: 'ready',
      database: 'UP',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      status: 'not_ready',
      database: 'DOWN',
      timestamp: new Date().toISOString()
    });
  }
};
app.get('/ready', readyHandler);
app.get('/api/ready', readyHandler);

/**
 * Continuously sampled event-loop delay. A healthy process stays near zero; a
 * sustained value in the hundreds of milliseconds means something is occupying
 * the loop and requests will be queuing behind it.
 */
let eventLoopDelayMs = 0;
const LOOP_SAMPLE_INTERVAL = 500;
let lastSampleAt = Date.now();
const loopSampler = setInterval(() => {
  const now = Date.now();
  eventLoopDelayMs = Math.max(now - lastSampleAt - LOOP_SAMPLE_INTERVAL, 0);
  lastSampleAt = now;
}, LOOP_SAMPLE_INTERVAL);
loopSampler.unref();

let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();

/** Share of one core consumed since the previous call. */
const sampleCpuPercent = () => {
  const now = Date.now();
  const usage = process.cpuUsage(lastCpu);
  const elapsedMs = Math.max(now - lastCpuAt, 1);
  lastCpu = process.cpuUsage();
  lastCpuAt = now;
  return Math.round(((usage.user + usage.system) / 1000 / elapsedMs) * 100);
};

// Detailed Health Check Endpoint (Verifies PostgreSQL connectivity and reports
// process health so a degraded instance can be spotted rather than guessed at)
app.get('/api/health/details', async (req, res) => {
  const process_ = {
    uptimeSeconds: Math.round(process.uptime()),
    eventLoopDelayMs,
    cpuPercentSinceLastCheck: sampleCpuPercent(),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    nodeVersion: process.version
  };

  try {
    const startedAt = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const databaseLatencyMs = Date.now() - startedAt;

    // A loop delay this large means the process is not keeping up, even though
    // it can still answer this request.
    const degraded = eventLoopDelayMs > 500;

    res.status(degraded ? 503 : 200).json({
      success: !degraded,
      status: degraded ? 'degraded' : 'healthy',
      services: { api: degraded ? 'DEGRADED' : 'UP', database: 'UP' },
      databaseLatencyMs,
      process: process_,
      ...(degraded ? { warning: 'Event loop is lagging; the process is saturated.' } : {}),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      status: 'degraded',
      services: { api: 'UP', database: 'DOWN' },
      error: 'PostgreSQL connection failed',
      process: process_,
      timestamp: new Date().toISOString()
    });
  }
});

// Authentication Routes (public: login/logout; /me is protected internally)
app.use('/api/auth', require('./routes/authRoutes'));

// Every route below serves candidate or recruitment data and requires a session.
const { requireAuth } = require('./middleware/auth');

// The dashboard overview is mounted at both paths: /api/dashboard is the
// documented name, /api/analytics is retained so existing clients keep working.
app.use('/api/dashboard', requireAuth, require('./routes/analyticsRoutes'));
app.use('/api/analytics', requireAuth, require('./routes/analyticsRoutes'));
app.use('/api/candidates', requireAuth, require('./routes/globalCandidateRoutes'));
app.use('/api/jobs', requireAuth, require('./routes/jobRoutes'));
app.use('/api/outlook', requireAuth, require('./routes/outlookRoutes'));
app.use('/api/jobs', requireAuth, require('./routes/candidateRoutes'));

// Additive AI layer. Mounted last and isolated behind its own prefix, so it
// cannot shadow an existing route. Every AI feature is off by default; with
// AI_ENABLED=false this route answers AI_DISABLED and nothing else changes.
app.use('/api/ai', requireAuth, require('./routes/aiRoutes'));

// Error Middlewares
const { notFound, errorHandler } = require('./middleware/errorHandler');
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Graceful Shutdown Signal Handlers
let isShuttingDown = false;
const handleShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
  try {
    await prisma.$disconnect();
    console.log('[PostgreSQL] Disconnected cleanly.');
  } catch (err) {
    console.error('[PostgreSQL Shutdown Error]:', err.message);
  }
  process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled promise rejection:', reason instanceof Error ? reason.message : reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err.message);
  if (process.env.NODE_ENV !== 'production' && err.stack) console.error(err.stack);
  handleShutdown('uncaughtException');
});

// Initialize Database Connection & Start Express Server
const startServer = async () => {
  // Fail fast on missing production secrets rather than booting insecurely.
  if (process.env.NODE_ENV === 'production') {
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl || !dbUrl.startsWith('postgres')) {
      console.error('[Server] DATABASE_URL must be set in production. Refusing to start.');
      process.exit(1);
    }
    const secret = process.env.JWT_SECRET || '';
    if (secret.length < 32) {
      console.error('[Server] JWT_SECRET must be at least 32 characters in production. Refusing to start.');
      process.exit(1);
    }
    if (allowedOrigins.length === 0) {
      console.error('[Server] FRONTEND_URL must be set in production so CORS has an allow list. Refusing to start.');
      process.exit(1);
    }
  }

  const listen = () =>
    app.listen(PORT, () => {
      console.log(`[Server] Running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      console.log(`[Server] API Base URL: http://localhost:${PORT}/api`);
      console.log(`[Server] CORS allow list: ${allowedOrigins.join(', ') || '(same-origin only)'}`);
    });

  try {
    await prisma.$connect();
    console.log('[PostgreSQL] Connected successfully via Prisma ORM.');

    const { ensureSeedUser } = require('./services/authService');
    const seed = await ensureSeedUser();
    if (seed.created) console.log(`[Auth] Created initial recruiter account for ${seed.email}.`);
    if (seed.warning) console.warn(`[Auth] ${seed.warning}`);

    listen();
  } catch (error) {
    console.error(`[PostgreSQL Error] Database connection failed: ${error.message}`);
    // Allow process to start in development mode even if DB isn't initialized yet
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Server] Starting without a verified database connection (development only).');
      listen();
    } else {
      process.exit(1);
    }
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;
