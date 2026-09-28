/**
 * Pure JavaScript Outlook .msg (CFBF / OLE) parser for browser and Vite environments.
 * Uses @kenjiuno/msgreader (no native Node bindings or external servers needed).
 * Extracts subject, sender, attachments, binary content, and handles nested messages.
 */

import MsgReaderPkg from '@kenjiuno/msgreader';
import { MAX_NESTED_EMAIL_DEPTH } from './constants.js';
import { parseEmlBuffer } from './parseEml.js';

const MsgReader = MsgReaderPkg.default || MsgReaderPkg;

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.rtf': 'application/rtf',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif'
};

/**
 * Parses an Outlook .msg binary buffer into a normalized Email model with attachments.
 *
 * @param {ArrayBuffer|Uint8Array} rawData
 * @param {Object} options
 * @param {string} [options.fileName='message.msg']
 * @param {string} [options.sourceType='file-picker']
 * @param {number} [options.depth=0]
 * @returns {Promise<Object>} Normalized email model
 */
export async function parseMsgBuffer(rawData, options = {}) {
  const { fileName = 'message.msg', sourceType = 'file-picker', depth = 0 } = options;
  const emailId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  try {
    let arrayBuffer;
    if (rawData instanceof ArrayBuffer) {
      arrayBuffer = rawData;
    } else if (ArrayBuffer.isView(rawData)) {
      arrayBuffer = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
    } else {
      arrayBuffer = new Uint8Array(rawData).buffer;
    }

    const reader = new MsgReader(arrayBuffer);
    const fileData = reader.getFileData();

    if (fileData.error) {
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
        parseError: fileData.error
      };
    }

    const subject = fileData.subject || '(No Subject)';
    const senderName = fileData.senderName || (fileData.senderEmail ? fileData.senderEmail.split('@')[0] : 'Unknown Sender');
    const senderEmail = fileData.senderEmail || '';
    const sentAt = fileData.messageDeliveryTime || fileData.creationTime || '';

    const attachments = [];
    const rawAttachments = fileData.attachments || [];

    for (let i = 0; i < rawAttachments.length; i++) {
      try {
        const rawAtt = rawAttachments[i];
        const extracted = reader.getAttachment(i);
        const originalFileName = extracted?.fileName || rawAtt?.fileName || rawAtt?.name || `attachment_${i + 1}`;
        const content = extracted?.content || rawAtt?.attachData;

        if (!content) continue;

        const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
        const size = bytes.byteLength || 0;
        const lowerName = originalFileName.toLowerCase();
        const lastDot = lowerName.lastIndexOf('.');
        const extension = lastDot >= 0 ? lowerName.slice(lastDot) : '';
        const mimeType = MIME_BY_EXT[extension] || rawAtt?.mimeType || 'application/octet-stream';
        const isInline = Boolean(rawAtt?.attachmentHidden || rawAtt?.contentId || rawAtt?.isInline);

        // Recursion for nested emails (up to MAX_NESTED_EMAIL_DEPTH)
        if (depth < MAX_NESTED_EMAIL_DEPTH) {
          if (extension === '.msg' || rawAtt?.innerMsgContent) {
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
          } else if (extension === '.eml') {
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
          contentId: rawAtt?.contentId || null,
          disposition: isInline ? 'inline' : 'attachment',
          sourceFileName: fileName,
          senderName,
          senderEmail
        });
      } catch (attError) {
        console.warn(`[MsgReader] Failed to extract attachment ${i}:`, attError);
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
      parseError: error.message || 'Failed to parse Outlook .msg message'
    };
  }
}
