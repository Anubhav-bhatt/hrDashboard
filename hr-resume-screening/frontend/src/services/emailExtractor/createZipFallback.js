/**
 * Client-side ZIP generation fallback using JSZip.
 *
 * Used when the browser does not support window.showDirectoryPicker()
 * (e.g. Firefox, Safari, non-Chromium or non-secure contexts), or when direct
 * folder write fails.
 *
 * Downloads ALL extracted resumes in ONE zip file:
 * resumes/
 *   Candidate_Resume.pdf
 *   Second_Resume.docx
 *
 * Never triggers individual browser downloads!
 */

import JSZip from 'jszip';

/**
 * Creates a single ZIP file containing all selected resumes and triggers local download.
 *
 * @param {Array<Object>} items
 * @param {Function} [onProgress] Callback with percentage (0-100)
 * @returns {Promise<{
 *   status: 'SAVED' | 'ERROR',
 *   count: number,
 *   fileName: string,
 *   method: 'ZIP',
 *   message?: string
 * }>}
 */
export async function downloadResumesAsZip(items, onProgress) {
  if (!items || items.length === 0) {
    return { status: 'SAVED', count: 0, fileName: '', method: 'ZIP' };
  }

  try {
    const zip = new JSZip();
    const folder = zip.folder('resumes');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const fileName = item.safeFileName || item.originalFileName || `resume_${i + 1}.pdf`;
      const bytes = item.bytes;
      folder.file(fileName, bytes);
    }

    const zipBlob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      },
      (metadata) => {
        if (onProgress) {
          onProgress(Math.round(metadata.percent));
        }
      }
    );

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const downloadName = `resume-extractor-${dateStr}.zip`;

    // Trigger client-side download
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Give browser a moment to register download before releasing blob URL
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 15000);

    return {
      status: 'SAVED',
      count: items.length,
      fileName: downloadName,
      method: 'ZIP'
    };
  } catch (error) {
    return {
      status: 'ERROR',
      count: 0,
      fileName: '',
      method: 'ZIP',
      message: error.message || 'Failed to generate ZIP file.'
    };
  }
}
