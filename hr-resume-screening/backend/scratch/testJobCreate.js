const prisma = require('../config/prisma');

async function testJobCreation() {
  console.log('Testing Prisma Job creation against local PostgreSQL database...');

  try {
    const job = await prisma.job.create({
      data: {
        title: 'Prisma Integration Test Role',
        jdFileName: 'test_jd.pdf',
        jdMimeType: 'application/pdf',
        jdText: 'Test Job Description text for PostgreSQL & Prisma ORM verification.',
        requiredSkills: ['React', 'Node.js', 'PostgreSQL'],
        preferredSkills: ['TypeScript', 'Prisma'],
        roleKeywords: ['Engineer', 'Developer'],
        minimumExperience: 4,
        preferredEducation: ["Bachelor's Degree"]
      }
    });

    console.log('✓ [SUCCESS] Job created in PostgreSQL via Prisma! Job ID:', job.id);
    console.log('  Job Title:', job.title);
    console.log('  Created At:', job.createdAt);

    // Clean up test job
    await prisma.job.delete({ where: { id: job.id } });
    console.log('✓ [CLEANUP] Test record deleted successfully.');
  } catch (error) {
    console.error('✕ [FAIL] Job creation error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testJobCreation();
