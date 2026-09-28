/**
 * Robust RFC 5322 / MIME .eml email parser for browsers.
 * Uses postal-mime (pure client-side parser, no Node dependencies).
 * Handles multipart/mixed, multipart/alternative, base64, quoted-printable,
 * RFC 2047 filename encodings, Content-Disposition, and nested MIME parts.
 */

import PostalMime from 'postal-mime';
import { MAX_NESTED_EMAIL_DEPTH } from './constants.js';
import { parseMsgBuffer } from './parseMsg.js';

/**
 * Parses an EML file or ArrayBuffer into a normalized Email model with attachments.
 *
 * @param {ArrayBuffer|Uint8Array|string} rawData
 * @param {Object} options
 * @param {string} [options.fileName='message.eml']
 * @param {string} [options.sourceType='file-picker']
 * @param {number} [options.depth=0]
 * @returns {Promise<Object>} Normalized email model
 */
export async function parseEmlBuffer(rawData, options = {}) {
  const { fileName = 'message.eml', sourceType = 'file-picker', depth = 0 } = options;
  const emailId = `eml-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  try {
    const parser = new PostalMime();
    const parsed = await parser.parse(rawData);

    const senderName = parsed.from?.name || (parsed.from?.address ? parsed.from.address.split('@')[0] : 'Unknown Sender');
    const senderEmail = parsed.from?.address || '';
    const subject = parsed.subject || '(No Subject)';
    const sentAt = parsed.date || '';

    const attachments = [];

    if (Array.isArray(parsed.attachments)) {
      for (let i = 0; i < parsed.attachments.length; i++) {
        const att = parsed.attachments[i];
        const originalFileName = att.filename || `attachment_${i + 1}`;
        const lowerName = originalFileName.toLowerCase();
        const content = att.content; // ArrayBuffer or Uint8Array
        const bytes = content instanceof Uint8Array ? content : new Uint8Array(content || 0);
        const size = bytes.byteLength || 0;
        const mimeType = att.mimeType || 'application/octet-stream';
        const lastDot = lowerName.lastIndexOf('.');
        const extension = lastDot >= 0 ? lowerName.slice(lastDot) : '';
        const isInline = att.disposition === 'inline' || Boolean(att.contentId);

        // Check for nested emails (up to MAX_NESTED_EMAIL_DEPTH)
        if (depth < MAX_NESTED_EMAIL_DEPTH) {
          if (extension === '.eml' || mimeType === 'message/rfc822') {
            try {
              const nested = await parseEmlBuffer(bytes.buffer, {
                fileName: originalFileName,
                sourceType: 'nested-eml',
                depth: depth + 1
              });
              if (nested.attachments && nested.attachments.length > 0) {
                attachments.push(...nested.attachments);
                continue;
              }
            } catch {
              // If nested parse fails, continue treating as regular attachment
            }
          } else if (extension === '.msg' || mimeType === 'application/vnd.ms-outlook') {
            try {
              const nested = await parseMsgBuffer(bytes.buffer, {
                fileName: originalFileName,
                sourceType: 'nested-msg',
                depth: depth + 1
              });
              if (nested.attachments && nested.attachments.length > 0) {
                attachments.push(...nested.attachments);
                continue;
              }
            } catch {
              // Fallback to regular attachment
            }
          }
        }

        attachments.push({
          id: `${emailId}-att-${i + 1}`,
          emailId,
          originalFileName,
          mimeType,
          extension,
          size,
          bytes,
          isInline,
          contentId: att.contentId || null,
          disposition: att.disposition || 'attachment',
          sourceFileName: fileName,
          senderName,
          senderEmail
        });
      }
    }

    return {
      id: emailId,
      subject,
      senderName,
      senderEmail,
      sentAt,
      sourceType,
      sourceFileName: fileName,
      attachments,
      parseStatus: 'SUCCESS',
      parseError: null
    };
  } catch (error) {
    return {
      id: emailId,
      subject: fileName,
      senderName: 'Unknown',
      senderEmail: '',
      sentAt: '',
      sourceType,
      sourceFileName: fileName,
      attachments: [],
      parseStatus: 'ERROR',
      parseError: error.message || 'Failed to parse EML message'
    };
  }
}
