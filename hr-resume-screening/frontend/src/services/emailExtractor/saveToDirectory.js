/**
 * Saves extracted resumes directly to a local directory selected by the recruiter
 * using the modern browser File System Access API (showDirectoryPicker).
 *
 * Feature detection guarantees safe fallback if the browser does not support directory picking.
 */

/**
 * Checks whether native directory picking is supported in the current browser.
 * @returns {boolean}
 */
export function isDirectoryPickerSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/**
 * Prompts the recruiter to select a folder and saves all extracted resumes into it.
 *
 * @param {Array<Object>} items List of extracted resume attachment objects
 * @param {Function} [onProgress] Callback with (savedCount, totalCount, currentFileName)
 * @returns {Promise<{
 *   status: 'SAVED' | 'CANCELLED' | 'PERMISSION_DENIED' | 'UNSUPPORTED' | 'ERROR',
 *   count?: number,
 *   folderName?: string,
 *   message?: string
 * }>}
 */
export async function saveResumesToDirectory(items, onProgress) {
  if (!items || items.length === 0) {
    return { status: 'SAVED', count: 0 };
  }

  if (!isDirectoryPickerSupported()) {
    return { status: 'UNSUPPORTED', message: 'Native directory picker is not supported in this browser.' };
  }

  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({
      id: 'hr-resume-extractor',
      mode: 'readwrite',
      startIn: 'downloads'
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      // User dismissed or closed the directory picker dialog (not an error)
      return { status: 'CANCELLED' };
    }
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return {
        status: 'PERMISSION_DENIED',
        message: 'Permission to access the selected folder was denied.'
      };
    }
    return { status: 'ERROR', message: error.message || 'Could not open folder picker.' };
  }

  try {
    const total = items.length;
    for (let i = 0; i < total; i++) {
      const item = items[i];
      const fileName = item.safeFileName || item.originalFileName || `resume_${i + 1}.pdf`;

      // Get or create file handle in the chosen directory
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();

      // Write bytes
      const bytes = item.bytes;
      await writable.write(bytes);
      await writable.close();

      if (onProgress) {
        onProgress(i + 1, total, fileName);
      }
    }

    return {
      status: 'SAVED',
      method: 'DIRECTORY',
      count: total,
      folderName: dirHandle.name || 'Selected Folder'
    };
  } catch (error) {
    return {
      status: 'ERROR',
      message: error.message || 'An error occurred while saving files to the directory.'
    };
  }
}
