require('isomorphic-fetch');
const { Client } = require('@microsoft/microsoft-graph-client');
const path = require('path');

/**
 * Development fixture mode. Only a token that explicitly starts with
 * MOCK_ACCESS_TOKEN activates it, and never when NODE_ENV is production, so
 * fabricated mailbox data cannot reach a deployed environment.
 */
const isMockToken = (accessToken) =>
  typeof accessToken === 'string' &&
  accessToken.startsWith('MOCK_ACCESS_TOKEN') &&
  process.env.NODE_ENV !== 'production';

/**
 * Initializes Microsoft Graph Client with specified access token
 */
const getGraphClient = (accessToken) => {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    }
  });
};

/**
 * Normalizes date bounds to ensure start of fromDate and end of toDate (23:59:59.999)
 */
const normalizeDateRange = (fromDateInput, toDateInput) => {
  const fromDate = new Date(fromDateInput);
  fromDate.setHours(0, 0, 0, 0);

  const toDate = new Date(toDateInput);
  toDate.setHours(23, 59, 59, 999);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new Error('Invalid date format provided for email search.');
  }

  if (fromDate > toDate) {
    throw new Error('From Date cannot be later than To Date.');
  }

  return { fromDate, toDate };
};

/**
 * Determines whether an attachment is a candidate resume (PDF/DOCX/DOC)
 * and ignores inline images, logos, and signature assets.
 */
const isResumeAttachment = (attachment) => {
  if (!attachment || !attachment.name) return false;

  // Ignore inline email signature assets & images
  if (attachment.isInline === true) return false;
  
  const ext = path.extname(attachment.name).toLowerCase();
  const mimeType = (attachment.contentType || '').toLowerCase();

  // Explicitly ignore common image formats used in signatures/trackers
  const IGNORED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.ico', '.html', '.htm', '.zip'];
  if (IGNORED_EXTENSIONS.includes(ext) || mimeType.startsWith('image/')) {
    return false;
  }

  // Supported resume extensions
  const RESUME_EXTENSIONS = ['.pdf', '.docx', '.doc'];
  return RESUME_EXTENSIONS.includes(ext);
};

/**
 * Gets user details from Microsoft Graph or Mock
 */
const getCurrentUser = async (accessToken) => {
  if (isMockToken(accessToken)) {
    return {
      id: 'mock-user-id-12345',
      email: 'hr.manager@acmecorp.com',
      displayName: 'HR Recruitment Team'
    };
  }

  const client = getGraphClient(accessToken);
  const user = await client.api('/me').select('id,mail,userPrincipalName,displayName').get();
  return {
    id: user.id,
    email: user.mail || user.userPrincipalName,
    displayName: user.displayName || 'HR User'
  };
};

/**
 * Recursively retrieves mail folders including child folders
 */
const getMailFolders = async (accessToken) => {
  if (isMockToken(accessToken)) {
    return [
      { id: 'folder-inbox', name: 'Inbox', totalItemCount: 142 },
      { id: 'folder-naukri', name: 'Naukri', totalItemCount: 88 },
      { id: 'folder-linkedin', name: 'LinkedIn Applications', totalItemCount: 65 },
      { id: 'folder-recruitment', name: 'Recruitment', totalItemCount: 120 },
      { id: 'folder-archive', name: 'Archive', totalItemCount: 310 }
    ];
  }

  const client = getGraphClient(accessToken);

  const fetchFolders = async (url) => {
    let foldersList = [];
    let response = await client.api(url).select('id,displayName,parentFolderId,totalItemCount,childFolderCount').top(100).get();

    for (const folder of response.value) {
      foldersList.push({
        id: folder.id,
        name: folder.displayName,
        parentFolderId: folder.parentFolderId,
        totalItemCount: folder.totalItemCount
      });

      if (folder.childFolderCount > 0) {
        try {
          const childFolders = await fetchFolders(`/me/mailFolders/${folder.id}/childFolders`);
          foldersList = foldersList.concat(childFolders);
        } catch (err) {
          console.warn(`Failed to fetch child folders for ${folder.displayName}:`, err.message);
        }
      }
    }
    return foldersList;
  };

  return await fetchFolders('/me/mailFolders');
};

/**
 * Mock generator for dev testing when real Microsoft OAuth token is not active
 */
const getMockMessages = (fromDate, toDate) => {
  const sampleCandidates = [
    { name: 'Rahul Sharma', email: 'rahul.sharma92@gmail.com', file: 'Rahul_Sharma_Resume.pdf', mime: 'application/pdf', daysAgo: 1 },
    { name: 'Priya Jain', email: 'priya.jain.tech@yahoo.com', file: 'Priya_Jain_CV.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', daysAgo: 2 },
    { name: 'Amit Kumar', email: 'amit.kumar.dev@outlook.com', file: 'Amit_Kumar_Profile.pdf', mime: 'application/pdf', daysAgo: 3 },
    { name: 'Sneha Patel', email: 'sneha.patel@gmail.com', file: 'SnehaPatel_SeniorReact.pdf', mime: 'application/pdf', daysAgo: 4 },
    { name: 'Vikram Singh', email: 'vikram.singh@naukri.com', file: 'Vikram_Singh_Resume.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', daysAgo: 5 },
    { name: 'Ananya Roy', email: 'ananya.roy@linkedin.com', file: 'AnanyaRoy_CV.pdf', mime: 'application/pdf', daysAgo: 6 }
  ];

  const now = new Date();
  const messages = [];

  sampleCandidates.forEach((cand, idx) => {
    const recvDate = new Date(now.getTime() - cand.daysAgo * 24 * 60 * 60 * 1000);
    
    // Filter within requested fromDate and toDate
    if (recvDate >= fromDate && recvDate <= toDate) {
      messages.push({
        id: `mock-msg-${idx + 1}`,
        subject: `Application for Senior React Developer - ${cand.name}`,
        senderName: cand.name,
        senderEmail: cand.email,
        receivedDateTime: recvDate.toISOString(),
        hasAttachments: true,
        attachments: [
          {
            id: `mock-att-${idx + 1}`,
            name: cand.file,
            contentType: cand.mime,
            isInline: false,
            size: 145000,
            isResume: true
          },
          {
            id: `mock-img-${idx + 1}`,
            name: 'company-logo.png',
            contentType: 'image/png',
            isInline: true,
            size: 4200,
            isResume: false
          }
        ]
      });
    }
  });

  // Add one email without resume (only signature image) to test attachment filter logic
  const nonResumeDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  if (nonResumeDate >= fromDate && nonResumeDate <= toDate) {
    messages.push({
      id: 'mock-msg-no-resume',
      subject: 'Inquiry regarding hiring process',
      senderName: 'General Query',
      senderEmail: 'query@techcompany.com',
      receivedDateTime: nonResumeDate.toISOString(),
      hasAttachments: true,
      attachments: [
        {
          id: 'mock-att-sig',
          name: 'signature_banner.jpg',
          contentType: 'image/jpeg',
          isInline: true,
          size: 12000,
          isResume: false
        }
      ]
    });
  }

  return messages;
};

/**
 * Retrieves messages from a folder within a date range with pagination support
 */
const getMessagesByFolderAndDate = async (accessToken, folderId, fromDateInput, toDateInput) => {
  const { fromDate, toDate } = normalizeDateRange(fromDateInput, toDateInput);

  if (isMockToken(accessToken)) {
    const rawMockMsgs = getMockMessages(fromDate, toDate);
    
    // Transform into clean candidate search response
    const applications = rawMockMsgs.map(msg => {
      const resumeAtt = msg.attachments.find(att => att.isResume);
      return {
        messageId: msg.id,
        subject: msg.subject,
        senderName: msg.senderName,
        senderEmail: msg.senderEmail,
        receivedDateTime: msg.receivedDateTime,
        hasAttachments: msg.hasAttachments,
        resumeAttachment: resumeAtt ? {
          attachmentId: resumeAtt.id,
          fileName: resumeAtt.name,
          contentType: resumeAtt.contentType,
          size: resumeAtt.size
        } : null,
        status: resumeAtt ? 'Ready' : 'No Resume Found'
      };
    });

    const resumesCount = applications.filter(app => app.resumeAttachment !== null).length;

    return {
      emailsScanned: applications.length,
      resumesDiscovered: resumesCount,
      nonResumeEmails: applications.length - resumesCount,
      applications
    };
  }

  const client = getGraphClient(accessToken);
  const maxEmails = parseInt(process.env.MAX_EMAIL_IMPORT || '2000', 10);

  const fromISO = fromDate.toISOString();
  const toISO = toDate.toISOString();

  let endpoint = `/me/mailFolders/${folderId}/messages?$filter=receivedDateTime ge ${fromISO} and receivedDateTime le ${toISO}&$expand=attachments&$select=id,subject,from,receivedDateTime,hasAttachments&$top=50`;

  let totalScanned = 0;
  const applications = [];

  while (endpoint && totalScanned < maxEmails) {
    const response = await client.api(endpoint).get();
    const messages = response.value || [];

    for (const msg of messages) {
      totalScanned++;
      const senderName = msg.from?.emailAddress?.name || 'Unknown';
      const senderEmail = msg.from?.emailAddress?.address || 'Unknown';

      const attachments = msg.attachments || [];
      const resumeAtt = attachments.find(att => isResumeAttachment(att));

      applications.push({
        messageId: msg.id,
        subject: msg.subject || '(No Subject)',
        senderName,
        senderEmail,
        receivedDateTime: msg.receivedDateTime,
        hasAttachments: Boolean(msg.hasAttachments),
        resumeAttachment: resumeAtt ? {
          attachmentId: resumeAtt.id,
          fileName: resumeAtt.name,
          contentType: resumeAtt.contentType || 'application/octet-stream',
          size: resumeAtt.size || 0
        } : null,
        status: resumeAtt ? 'Ready' : 'No Resume Found'
      });
    }

    endpoint = response['@odata.nextLink'] ? response['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
  }

  const resumesCount = applications.filter(app => app.resumeAttachment !== null).length;

  return {
    emailsScanned: totalScanned,
    resumesDiscovered: resumesCount,
    nonResumeEmails: totalScanned - resumesCount,
    applications
  };
};

/**
 * Retrieves resume attachment contents as an IN-MEMORY Buffer.
 * Does NOT write any files to disk.
 */
const getAttachmentBuffer = async (accessToken, messageId, attachmentId) => {
  if (isMockToken(accessToken)) {
    // Generate a valid mock Buffer (e.g. text/pdf buffer content) strictly in memory
    const sampleText = `%PDF-1.4 Mock Candidate Resume Content for message ${messageId} attachment ${attachmentId}\nCandidate: Senior React Developer Applicant\nSkills: React, JavaScript, Node.js, Express, MongoDB.`;
    const buffer = Buffer.from(sampleText, 'utf-8');
    return {
      fileName: `Candidate_Resume_${attachmentId}.pdf`,
      mimeType: 'application/pdf',
      buffer
    };
  }

  const client = getGraphClient(accessToken);
  const attachment = await client
    .api(`/me/messages/${messageId}/attachments/${attachmentId}`)
    .get();

  if (!attachment || !attachment.contentBytes) {
    throw new Error('Attachment content could not be retrieved from Microsoft Graph.');
  }

  // Convert base64 bytes from Graph API into Node Buffer
  const buffer = Buffer.from(attachment.contentBytes, 'base64');

  return {
    fileName: attachment.name || 'resume.pdf',
    mimeType: attachment.contentType || 'application/octet-stream',
    buffer
  };
};

module.exports = {
  getCurrentUser,
  getMailFolders,
  getMessagesByFolderAndDate,
  getAttachmentBuffer,
  isResumeAttachment,
  normalizeDateRange,
  isMockToken
};
