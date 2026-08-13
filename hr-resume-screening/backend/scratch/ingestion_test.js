const prisma = require('../config/prisma');
const { processCandidateResume } = require('../services/candidateProcessingService');

async function runIngestionTest() {
  console.log('====================================================');
  console.log('   HR Resume Screening - Ingestion System Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    // Create test job
    const job = await prisma.job.create({
      data: {
        title: 'Senior React Engineer (Test Job)',
        jdFileName: 'React_JD.pdf',
        jdMimeType: 'application/pdf',
        jdText: 'Looking for a Senior React Engineer with 3+ years experience in React, TypeScript, Node.js, PostgreSQL, and AWS.',
        requiredSkills: ['React', 'TypeScript', 'Node.js'],
        preferredSkills: ['AWS', 'Docker'],
        searchKeywords: ['EV Charging', 'OCPP'],
        minimumExperience: 3,
        maximumExperience: 8,
        salaryMin: 800000,
        salaryMax: 1600000,
        preferredLocations: ['Gurugram', 'Noida'],
        qualifications: ['B.Tech', 'B.E.']
      }
    });

    console.log(`[INIT] Created test job ID: ${job.id}`);

    // TEST 1: Single PDF Resume Processing
    const pdfText = `Rahul Sharma
Email: rahul.sharma.test@gmail.com
Phone: +91 9876543210
Location: Gurugram
Education: B.Tech Computer Science
Current Role: Senior React Developer
Total Experience: 4.5 years of experience
Skills: React, TypeScript, Node.js, PostgreSQL, AWS, EV Charging, OCPP
Projects: Developed EV charging management platform using React and Node.js.
Current CTC: 8 LPA
Expected CTC: 12 LPA`;
    
    const pdfBuffer = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${pdfText.length} >>\nstream\n${pdfText}\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`);
    
    // We mock buffer text parsing via processCandidateResume
    const res1 = await processCandidateResume({
      jobId: job.id,
      buffer: Buffer.from(`Rahul Sharma\nEmail: rahul.test1@gmail.com\nPhone: +91 9876543210\nLocation: Gurugram\nEducation: B.Tech Computer Science\nCurrent Role: Senior React Developer\nTotal Experience: 4.5 years of experience\nSkills: React, TypeScript, Node.js, PostgreSQL, AWS, EV Charging, OCPP\nProjects: EV Charger Dashboard\nCurrent CTC: 8 LPA\nExpected CTC: 12 LPA\nResume text body long enough for min length validation check text.`),
      fileName: 'Rahul_Sharma.txt',
      mimeType: 'text/plain',
      sourceType: 'MANUAL_SINGLE'
    });

    if (res1.status === 'SUCCESS' && res1.score >= 80) {
      console.log(`✓ [PASS] Test 1: Single TXT/Resume upload successful (Score: ${res1.score}%, Candidate: ${res1.candidateName})`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Test 1: Single upload failed`, res1);
      failed++;
    }

    // TEST 2: Duplicate Single Upload (Same Hash)
    const res2 = await processCandidateResume({
      jobId: job.id,
      buffer: Buffer.from(`Rahul Sharma\nEmail: rahul.test1@gmail.com\nPhone: +91 9876543210\nLocation: Gurugram\nEducation: B.Tech Computer Science\nCurrent Role: Senior React Developer\nTotal Experience: 4.5 years of experience\nSkills: React, TypeScript, Node.js, PostgreSQL, AWS, EV Charging, OCPP\nProjects: EV Charger Dashboard\nCurrent CTC: 8 LPA\nExpected CTC: 12 LPA\nResume text body long enough for min length validation check text.`),
      fileName: 'Rahul_Sharma_Copy.txt',
      mimeType: 'text/plain',
      sourceType: 'MANUAL_SINGLE'
    });

    if (res2.status === 'DUPLICATE') {
      console.log(`✓ [PASS] Test 2: Duplicate single resume detected cleanly via SHA-256 hash`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Test 2: Duplicate detection failed`, res2);
      failed++;
    }

    // TEST 3: Unsupported File Format (.jpg)
    const res3 = await processCandidateResume({
      jobId: job.id,
      buffer: Buffer.from('FAKE_IMAGE_BYTES'),
      fileName: 'profile_photo.jpg',
      mimeType: 'image/jpeg',
      sourceType: 'MANUAL_SINGLE'
    });

    if (res3.status === 'UNSUPPORTED') {
      console.log(`✓ [PASS] Test 3: Unsupported file format (.jpg) cleanly rejected`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Test 3: Unsupported file format test failed`, res3);
      failed++;
    }

    // TEST 4: Oversized Resume File (>10MB)
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
    const res4 = await processCandidateResume({
      jobId: job.id,
      buffer: largeBuffer,
      fileName: 'oversized_resume.pdf',
      mimeType: 'application/pdf',
      sourceType: 'MANUAL_SINGLE'
    });

    if (res4.status === 'FAILED' && res4.message.includes('exceeds maximum')) {
      console.log(`✓ [PASS] Test 4: Oversized resume (>10MB) rejected safely`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Test 4: Oversized file test failed`, res4);
      failed++;
    }

    // TEST 5: Bulk Batch Upload (10 Resumes) with Failure Isolation
    console.log(`\n[BULK] Starting 10-Resume Batch Upload Test...`);
    const bulkPromises = [];
    for (let i = 1; i <= 10; i++) {
      const isCorrupt = i === 5;
      const phoneDigits = (1000 + i).toString();
      const text = isCorrupt
        ? 'Short'
        : `Candidate ${i}\nEmail: candidate${i}@example.com\nPhone: +91 98000${phoneDigits}\nTotal Experience: ${i + 1} years of experience\nLocation: Noida\nEducation: B.Tech\nSkills: React, Node.js, TypeScript\nCurrent CTC: ${i + 5} LPA\nResume text body long enough for min length validation check text.`;
      
      bulkPromises.push(
        processCandidateResume({
          jobId: job.id,
          buffer: Buffer.from(text),
          fileName: `Candidate_${i}.${isCorrupt ? 'txt' : 'txt'}`,
          mimeType: 'text/plain',
          sourceType: 'MANUAL_BULK',
          relativePath: `Frontend/Subfolder/Candidate_${i}.txt`
        })
      );
    }

    const bulkResults = await Promise.all(bulkPromises);
    const bulkSuccesses = bulkResults.filter(r => r.status === 'SUCCESS').length;
    const bulkFailed = bulkResults.filter(r => r.status === 'EMPTY_RESUME' || r.status === 'FAILED').length;

    if (bulkSuccesses === 9 && bulkFailed === 1) {
      console.log(`✓ [PASS] Test 5: Bulk 10-Resume batch processed with 9 successes and 1 isolated failure`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Test 5: Bulk batch test failed`, { bulkSuccesses, bulkFailed });
      failed++;
    }

    // TEST 6: Same Resume to Different Job (Allowed)
    const job2 = await prisma.job.create({
      data: {
        title: 'Backend Node.js Architect',
        jdFileName: 'Backend_JD.pdf',
        jdMimeType: 'application/pdf',
        jdText: 'Looking for a Backend Node.js Architect with PostgreSQL expertise.',
        requiredSkills: ['Node.js', 'PostgreSQL']
      }
    });

    const res6 = await processCandidateResume({
      jobId: job2.id,
      buffer: Buffer.from(`Rahul Sharma\nEmail: rahul.test1@gmail.com\nPhone: +91 9876543210\nLocation: Gurugram\nEducation: B.Tech Computer Science\nCurrent Role: Senior React Developer\nTotal Experience: 4.5 years of experience\nSkills: React, TypeScript, Node.js, PostgreSQL, AWS, EV Charging, OCPP\nProjects: EV Charger Dashboard\nCurrent CTC: 8 LPA\nExpected CTC: 12 LPA\nResume text body long enough for min length validation check text.`),
      fileName: 'Rahul_Sharma.txt',
      mimeType: 'text/plain',
      sourceType: 'MANUAL_SINGLE'
    });

    if (res6.status === 'SUCCESS') {
      console.log(`✓ [PASS] Test 6: Same resume uploaded to a different job allowed cleanly (Score: ${res6.score}%)`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Test 6: Different job upload failed`, res6);
      failed++;
    }

    // TEST 7: Representative Scale Batch (100 Resumes Memory & Stability Test)
    console.log(`\n[SCALE] Running 100-Resume Scalability & Memory Test...`);
    const initialMem = process.memoryUsage().heapUsed;

    const hundredResults = [];
    const chunkSize = 10;
    for (let chunkIdx = 0; chunkIdx < 10; chunkIdx++) {
      const chunkPromises = [];
      for (let i = 0; i < chunkSize; i++) {
        const globalId = chunkIdx * chunkSize + i;
        const text = `Scalability Candidate ${globalId}\nEmail: scale${globalId}@test.org\nPhone: +91 9111111${globalId.toString().padStart(3, '0')}\nTotal Experience: ${2 + (globalId % 5)} years of experience\nLocation: Gurugram\nEducation: MCA\nSkills: React, Node.js, TypeScript, PostgreSQL\nCurrent CTC: 10 LPA\nResume body text content formatted properly for length validation checks.`;
        chunkPromises.push(
          processCandidateResume({
            jobId: job.id,
            buffer: Buffer.from(text),
            fileName: `Scale_Candidate_${globalId}.txt`,
            mimeType: 'text/plain',
            sourceType: 'MANUAL_BULK',
            relativePath: `Folder_${chunkIdx}/Scale_Candidate_${globalId}.txt`
          })
        );
      }
      const chunkRes = await Promise.all(chunkPromises);
      hundredResults.push(...chunkRes);
    }

    const scaleSuccesses = hundredResults.filter(r => r.status === 'SUCCESS').length;
    const finalMem = process.memoryUsage().heapUsed;
    const memDeltaMB = ((finalMem - initialMem) / (1024 * 1024)).toFixed(2);

    if (scaleSuccesses === 100) {
      console.log(`✓ [PASS] Test 7: 100-Resume batch completed with 100% success (Memory Delta: ${memDeltaMB} MB)`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Test 7: 100-Resume scale test failed`, { scaleSuccesses });
      failed++;
    }

    // Cleanup test jobs
    await prisma.job.delete({ where: { id: job.id } });
    await prisma.job.delete({ where: { id: job2.id } });

    console.log('\n====================================================');
    console.log(`   FINAL TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log('====================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  }
}

runIngestionTest();
