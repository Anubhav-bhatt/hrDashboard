/**
 * Synthetic test fixtures for Outlook Email Resume Extractor.
 * Strictly uses fictional dummy data without any real candidate PII.
 */

/**
 * Builds an RFC 5322 / MIME .eml string with attachments.
 * @param {Object} options
 * @param {string} options.subject
 * @param {string} options.from
 * @param {string} [options.to]
 * @param {string} [options.date]
 * @param {string} [options.body]
 * @param {Array<{
 *   filename: string,
 *   contentType: string,
 *   data: Uint8Array|Buffer|string,
 *   disposition?: string,
 *   contentId?: string
 * }>} [options.attachments]
 * @returns {string} Raw MIME message string
 */
export function buildEmlString(options) {
  const {
    subject = 'Application for Senior Engineer',
    from = 'Jane Candidate <jane.candidate@example.invalid>',
    to = 'recruiter@company.invalid',
    date = 'Mon, 28 Sep 2026 10:00:00 +0000',
    body = 'Please consider my application. Resume attached.',
    attachments = []
  } = options;

  if (!attachments || attachments.length === 0) {
    return [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${date}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body
    ].join('\r\n');
  }

  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    body
  ];

  for (const att of attachments) {
    const disp = att.disposition || 'attachment';
    let base64Data;
    if (typeof att.data === 'string') {
      base64Data = Buffer.from(att.data, 'utf-8').toString('base64');
    } else {
      base64Data = Buffer.from(att.data).toString('base64');
    }

    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"`);
    lines.push(`Content-Transfer-Encoding: base64`);
    if (att.contentId) {
      lines.push(`Content-ID: <${att.contentId}>`);
    }
    lines.push(`Content-Disposition: ${disp}; filename="${att.filename}"`);
    lines.push('');
    lines.push(base64Data);
  }

  lines.push(`--${boundary}--`);
  lines.push('');

  return lines.join('\r\n');
}

/**
 * Creates dummy PDF binary content with valid %PDF header.
 * @param {string} [marker='dummy-pdf-content']
 * @returns {Uint8Array}
 */
export function createDummyPdf(marker = 'dummy-pdf-content') {
  const header = '%PDF-1.4\n1 0 obj\n<< /Title (Synthetic Resume) >>\nendobj\n';
  const body = `stream\nResume Content: ${marker}\nendstream\n`;
  const footer = 'xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n120\n%%EOF';
  return Buffer.from(header + body + footer, 'utf-8');
}

/**
 * Creates dummy DOCX binary content with valid PK\x03\x04 zip header.
 * @param {string} [marker='dummy-docx-content']
 * @returns {Uint8Array}
 */
export function createDummyDocx(marker = 'dummy-docx-content') {
  // PK\x03\x04 zip local file header
  const pkHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);
  const content = Buffer.from(`synthetic-docx-data-${marker}`, 'utf-8');
  return Buffer.concat([pkHeader, content]);
}

/**
 * Creates dummy PNG signature image.
 * @returns {Uint8Array}
 */
export function createDummyPng() {
  // PNG magic bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dummyPayload = Buffer.from('dummy-signature-image-bytes', 'utf-8');
  return Buffer.concat([pngHeader, dummyPayload]);
}

/**
 * Synthetic test email fixtures covering all prompt requirements:
 * 1. 1 email + 1 PDF resume
 * 2. 1 email + DOCX resume
 * 3. 1 email + PDF + image signature
 * 4. 1 email + no attachment
 * 5. 1 email + 2 resume-like attachments
 * 6. duplicate resume across 2 emails
 * 7. same filename different content
 * 8. Unicode filename
 * 9. very long filename
 * 10. corrupt attachment
 * 11. nested EML
 * 12. inline logo
 */
export function createSyntheticTestFixtures() {
  const pdfBytesAlpha = createDummyPdf('Candidate Alpha Qualifications');
  const pdfBytesBeta = createDummyPdf('Candidate Beta Skills and History');
  const pdfBytesShared = createDummyPdf('Shared Identical Resume Payload'); // For duplicate test
  const docxBytes = createDummyDocx('Candidate Gamma DOCX');
  const signatureBytes = createDummyPng();

  // 1. Email 1: 1 email + 1 PDF resume
  const email1 = buildEmlString({
    subject: 'Application - Alex Smith - Frontend Dev',
    from: 'Alex Smith <alex.smith@example.invalid>',
    attachments: [
      { filename: 'Alex_Smith_Resume.pdf', contentType: 'application/pdf', data: pdfBytesAlpha }
    ]
  });

  // 2. Email 2: 1 email + DOCX resume
  const email2 = buildEmlString({
    subject: 'Resume: Priya Patel for Senior Role',
    from: 'Priya Patel <priya.patel@example.invalid>',
    attachments: [
      {
        filename: 'Priya_Patel_CV.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data: docxBytes
      }
    ]
  });

  // 3. Email 3: 1 email + PDF + image signature
  const email3 = buildEmlString({
    subject: 'Application: Jordan Lee',
    from: 'Jordan Lee <jordan.lee@example.invalid>',
    attachments: [
      { filename: 'Jordan_Lee_Resume.pdf', contentType: 'application/pdf', data: pdfBytesBeta },
      {
        filename: 'image001.png',
        contentType: 'image/png',
        data: signatureBytes,
        disposition: 'inline',
        contentId: 'logo_img'
      }
    ]
  });

  // 4. Email 4: 1 email + no attachment
  const email4 = buildEmlString({
    subject: 'Inquiry regarding hiring status',
    from: 'Curious Applicant <curious@example.invalid>',
    body: 'Hi, I saw your job posting and would like to ask if the role is still open.'
  });

  // 5. Email 5: 1 email + 2 resume-like attachments
  const email5 = buildEmlString({
    subject: 'Elena Rostova - CV and Portfolio',
    from: 'Elena Rostova <elena@example.invalid>',
    attachments: [
      { filename: 'Elena_Rostova_CV.pdf', contentType: 'application/pdf', data: createDummyPdf('Elena CV') },
      { filename: 'Elena_Portfolio_Summary.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: createDummyDocx('Elena Portfolio') }
    ]
  });

  // 6. Email 6: Duplicate resume across 2 emails (Part 1)
  const email6 = buildEmlString({
    subject: 'FWD: Resume Submission - Rahul Sharma',
    from: 'Agency Recruiter <agency@example.invalid>',
    attachments: [
      { filename: 'Rahul_Sharma_Resume.pdf', contentType: 'application/pdf', data: pdfBytesShared }
    ]
  });

  // 7. Email 7: Duplicate resume across 2 emails (Part 2 - identical bytes, different filename)
  const email7 = buildEmlString({
    subject: 'Rahul Sharma Application Direct',
    from: 'Rahul Sharma <rahul.sharma@example.invalid>',
    attachments: [
      { filename: 'Rahul_CV_Updated.pdf', contentType: 'application/pdf', data: pdfBytesShared } // Same hash as email6!
    ]
  });

  // 8. Email 8: Same filename different content (Collision test)
  const email8 = buildEmlString({
    subject: 'Resume submission',
    from: 'Different Candidate <candidate2@example.invalid>',
    attachments: [
      { filename: 'resume.pdf', contentType: 'application/pdf', data: createDummyPdf('Candidate 2 payload') }
    ]
  });

  // 9. Email 9: Same filename 'resume.pdf', but DIFFERENT candidate & content
  const email9 = buildEmlString({
    subject: 'My Resume',
    from: 'Third Candidate <candidate3@example.invalid>',
    attachments: [
      { filename: 'resume.pdf', contentType: 'application/pdf', data: createDummyPdf('Candidate 3 payload') }
    ]
  });

  // 10. Email 10: Unicode filename
  const email10 = buildEmlString({
    subject: 'Candidature: François Müller',
    from: 'François Müller <francois@example.invalid>',
    attachments: [
      { filename: 'CV_François_Müller_Développeur.pdf', contentType: 'application/pdf', data: createDummyPdf('Francois Resume') }
    ]
  });

  // 11. Email 11: Very long filename
  const longName = 'Very_Long_Descriptive_Filename_Candidate_Resume_Curriculum_Vitae_Software_Engineering_Lead_Specialist_2026_Final_Version_Approved.pdf';
  const email11 = buildEmlString({
    subject: 'Application with detailed filename',
    from: 'Wordy Candidate <wordy@example.invalid>',
    attachments: [
      { filename: longName, contentType: 'application/pdf', data: createDummyPdf('Wordy Resume') }
    ]
  });

  // 12. Email 12: Corrupt attachment (zero bytes)
  const email12 = buildEmlString({
    subject: 'Application - Broken Attachment',
    from: 'Unlucky Candidate <unlucky@example.invalid>',
    attachments: [
      { filename: 'Corrupt_Resume.pdf', contentType: 'application/pdf', data: Buffer.alloc(0) }
    ]
  });

  // 13. Email 13: Nested EML
  const innerEml = buildEmlString({
    subject: 'Inner Candidate Message',
    from: 'Inner Candidate <inner@example.invalid>',
    attachments: [
      { filename: 'Inner_Candidate_Resume.pdf', contentType: 'application/pdf', data: createDummyPdf('Inner Candidate') }
    ]
  });
  const email13 = buildEmlString({
    subject: 'Forwarded candidate email',
    from: 'Forwarding Manager <manager@example.invalid>',
    attachments: [
      { filename: 'forwarded_application.eml', contentType: 'message/rfc822', data: Buffer.from(innerEml, 'utf-8') }
    ]
  });

  // 14. Email 14: Inline company logo
  const email14 = buildEmlString({
    subject: 'Application with company banner',
    from: 'Corporate Candidate <corp@example.invalid>',
    attachments: [
      { filename: 'Corporate_CV.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: createDummyDocx('Corporate CV') },
      { filename: 'company-logo.gif', contentType: 'image/gif', data: signatureBytes, disposition: 'inline', contentId: 'corp_logo' }
    ]
  });

  return [
    { name: '01_alex_smith.eml', content: email1 },
    { name: '02_priya_patel.eml', content: email2 },
    { name: '03_jordan_lee.eml', content: email3 },
    { name: '04_no_attachment.eml', content: email4 },
    { name: '05_elena_two_docs.eml', content: email5 },
    { name: '06_rahul_duplicate_part1.eml', content: email6 },
    { name: '07_rahul_duplicate_part2.eml', content: email7 },
    { name: '08_collision_part1.eml', content: email8 },
    { name: '09_collision_part2.eml', content: email9 },
    { name: '10_unicode_francois.eml', content: email10 },
    { name: '11_long_filename.eml', content: email11 },
    { name: '12_corrupt_attachment.eml', content: email12 },
    { name: '13_nested_eml.eml', content: email13 },
    { name: '14_inline_logo.eml', content: email14 }
  ];
}
