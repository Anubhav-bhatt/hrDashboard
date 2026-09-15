/**
 * Upload-pipeline API regressions.
 *
 * Runs the real Express routes, Multer middleware, parser, scorer and Prisma
 * persistence against the configured test database.
 */
require('dotenv').config();
const http = require('http');
const { createSuite, assert } = require('./harness');
const prisma = require('../config/prisma');
const app = require('../server');
const { hashPassword } = require('../services/authService');

const suite = createSuite('Upload pipeline API regressions');
const { testAsync } = suite;
const PREFIX = 'upload-pipeline-test';
const TEST_EMAIL = `${PREFIX}@example.invalid`;
const TEST_PASSWORD = 'UploadPipelineTest123!';

let server;
let baseUrl;
let cookie = '';
let userId;
let jobId;

const request = async (path, { method = 'GET', body, form, authenticated = true } = {}) => {
  const headers = {};
  if (authenticated && cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: form || (body !== undefined ? JSON.stringify(body) : undefined)
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    setCookie: response.headers.get('set-cookie')
  };
};

const validResume = Buffer.from(`
Ordered Candidate
ordered.candidate@example.invalid
+91 9000012345
Senior React Developer
Professional Summary
Engineer with five years of experience building accessible enterprise applications.
Skills
React, JavaScript, Node.js, PostgreSQL, Docker
Experience
Senior Developer at Synthetic Labs, January 2021 - Present
Education
B.Tech Computer Science, Synthetic University, 2020
Projects
Built an accessible recruitment dashboard and REST API.
`);

const setup = async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { passwordHash: await hashPassword(TEST_PASSWORD), isActive: true },
    create: {
      email: TEST_EMAIL,
      passwordHash: await hashPassword(TEST_PASSWORD),
      name: 'Upload Pipeline Tester',
      role: 'ADMIN'
    }
  });
  userId = user.id;

  const login = await request('/auth/login', {
    method: 'POST',
    authenticated: false,
    body: { email: TEST_EMAIL, password: TEST_PASSWORD }
  });
  cookie = login.setCookie.split(';')[0];

  const job = await prisma.job.create({
    data: {
      title: `${PREFIX} React Developer`,
      jdFileName: 'upload-pipeline-jd.txt',
      jdMimeType: 'text/plain',
      jdText: 'Senior React Developer. Required: React, Node.js and PostgreSQL. Minimum 3 years experience.',
      requiredSkills: ['React', 'Node.js', 'PostgreSQL'],
      preferredSkills: ['Docker'],
      roleKeywords: ['react developer'],
      minimumExperience: 3,
      preferredEducation: ['B.Tech']
    }
  });
  jobId = job.id;
};

const teardown = async () => {
  if (jobId) await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
};

const run = async () => {
  await setup();

  await testAsync('bulk results remain aligned with multipart input order when files finish out of order', async () => {
    const form = new FormData();
    form.append('resumes', new Blob([validResume], { type: 'text/plain' }), 'valid-first.txt');
    form.append('resumes', new Blob([Buffer.from('not a valid PDF')], { type: 'application/pdf' }), 'corrupt-second.pdf');

    const response = await request(`/jobs/${jobId}/candidates/bulk-upload`, { method: 'POST', form });

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(
      response.body.data.items.map((item) => item.fileName),
      ['valid-first.txt', 'corrupt-second.pdf'],
      'the frontend associates results by index, so the API must preserve multipart order'
    );
    assert.deepStrictEqual(response.body.data.items.map((item) => item.status), ['SUCCESS', 'FAILED']);
  });

  const { failed } = suite.summary();
  await teardown();
  process.exit(failed > 0 ? 1 : 0);
};

run().catch(async (error) => {
  console.error(error.stack || error);
  await teardown().catch(() => {});
  process.exit(1);
});
