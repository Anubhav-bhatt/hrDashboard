/**
 * Cryptographic content hashing for extracted email attachments.
 * Used for deterministic content-based deduplication without relying on filenames.
 */

/**
 * Computes a SHA-256 hex digest of attachment bytes.
 * Works seamlessly in modern browsers via window.crypto.subtle,
 * with graceful fallback to Node.js crypto in test environments.
 *
 * @param {ArrayBuffer|Uint8Array|Buffer} data
 * @returns {Promise<string>} Hex-encoded SHA-256 string
 */
export async function calculateSha256(data) {
  if (!data) return '';

  let buffer;
  if (data instanceof ArrayBuffer) {
    buffer = data;
  } else if (ArrayBuffer.isView(data)) {
    // Uint8Array or similar
    buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  } else {
    buffer = new Uint8Array(data).buffer;
  }

  // 1. Web Crypto API (standard in all modern browsers, Node 18+, workers, and secure contexts)
  const subtle = globalThis.crypto?.subtle;

  if (subtle) {
    const hashBuffer = await subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // 2. Fallback 32-bit FNV-1a hash if no subtle crypto available (failsafe)
  let hash = 2166136261;
  const view = new Uint8Array(buffer);
  for (let i = 0; i < view.length; i++) {
    hash ^= view[i];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
