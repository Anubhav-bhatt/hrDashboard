import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, FileWarning, Loader2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, cx } from '../ui';
import {
  downloadCandidateResume,
  fetchCandidateResumeObjectUrl,
  getCandidateResumeUrl,
  toApiError
} from '../../services/api';
import { formatFileSize } from '../../utils/format';
import { useToast } from '../ToastProvider';

/**
 * Resume panel.
 *
 * PDFs are previewed inline. Other formats cannot be rendered by the browser, so
 * the panel offers open/download plus the extracted text instead of showing a
 * broken frame. When the original document was never stored, that is stated
 * plainly rather than implied.
 */
const CandidateResumeViewer = ({ candidate }) => {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeView, setActiveView] = useState('document');

  const resume = candidate.resume || {};
  const jobId = candidate.jobId;
  const candidateId = candidate._id;

  const isPdf = String(resume.mimeType || '').includes('pdf');
  const isPlainText = String(resume.mimeType || '').startsWith('text/');
  const viewUrl = getCandidateResumeUrl(jobId, candidateId);

  // Text is the only view when there is no document to render, and for
  // plain-text resumes the browser has nothing better to show.
  const hasText = Boolean(resume.hasExtractedText && resume.text);
  const showText = hasText && (activeView === 'text' || !resume.available || (isPlainText && !isPdf));

  // PDFs are previewed from a same-origin blob so the browser's PDF viewer can
  // render them; the API's framing protections stay in force.
  useEffect(() => {
    if (!isPdf || !resume.available) return undefined;

    let objectUrl = null;
    let active = true;
    const controller = new AbortController();

    setPreviewLoading(true);
    setPreviewError(null);

    fetchCandidateResumeObjectUrl(jobId, candidateId, { signal: controller.signal })
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreviewUrl(url);
      })
      .catch((error) => {
        const apiError = toApiError(error);
        if (!active || apiError.canceled) return;
        setPreviewError(apiError);
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isPdf, resume.available, jobId, candidateId]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadCandidateResume(jobId, candidateId, resume.fileName || 'resume');
      toast.success('Resume download started.');
    } catch (error) {
      toast.error(toApiError(error).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card padding="p-0" className="overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-card-title inline-flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" aria-hidden="true" />
            Resume
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-xs text-slate-500 font-mono truncate max-w-[16rem]" title={resume.fileName}>
              {resume.fileName || 'Unknown file'}
            </span>
            {resume.sizeBytes ? <Badge variant="neutral">{formatFileSize(resume.sizeBytes)}</Badge> : null}
            {resume.extractionStatus === 'PARTIAL' && <Badge variant="warning">Partial extraction</Badge>}
          </div>
        </div>

        {resume.available && (
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-secondary"
              aria-label="Open the original resume in a new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              Open
            </a>
            <Button variant="primary" size="sm" icon={Download} loading={downloading} onClick={handleDownload}>
              Download
            </Button>
          </div>
        )}
      </div>

      {/* Document / Extracted text switch. The extracted text is a deliberate
          second view rather than a wall of text under the preview. */}
      {resume.hasExtractedText && resume.text && resume.available && (
        <div className="px-5 pt-3">
          <div className="inline-flex items-center gap-1 p-0.5 rounded-control bg-slate-100" role="tablist" aria-label="Resume view">
            {[
              { id: 'document', label: 'Document' },
              { id: 'text', label: 'Extracted text' }
            ].map((view) => (
              <button
                key={view.id}
                type="button"
                role="tab"
                aria-selected={activeView === view.id}
                onClick={() => setActiveView(view.id)}
                className={cx(
                  'px-3 py-1.5 rounded-[0.375rem] text-xs font-semibold transition-colors duration-fast',
                  activeView === view.id
                    ? 'bg-white text-slate-900 shadow-card'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-5">
        {showText ? (
          <div className="rounded-control border border-slate-200 bg-slate-50 p-4 max-h-[70vh] min-h-[420px] overflow-y-auto scroll-slim">
            {/* Rendered as text, never as HTML — resume content is untrusted. */}
            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{resume.text}</pre>
          </div>
        ) : !resume.available ? (
          <EmptyState
            icon={FileWarning}
            title="Original document not available"
            description={
              resume.storage === 'OUTLOOK'
                ? 'This resume lives in the connected Outlook mailbox. Reconnect the mailbox to open the original file.'
                : 'This candidate was imported before resume files were retained. The extracted text is shown below.'
            }
            className="border-0 shadow-none py-6"
          />
        ) : isPdf && previewLoading ? (
          <div
            className="rounded-control border border-slate-200 bg-slate-50 h-[70vh] min-h-[420px] flex flex-col items-center justify-center gap-3"
            role="status"
          >
            <Loader2 className="w-6 h-6 text-brand-600 animate-spin" aria-hidden="true" />
            <p className="text-meta text-slate-500">Loading resume preview…</p>
          </div>
        ) : isPdf && previewError ? (
          <div className="rounded-control border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-meta text-amber-900">
              The preview could not be loaded ({previewError.message}) Use <strong>Open</strong> or{' '}
              <strong>Download</strong> to view the original document.
            </p>
          </div>
        ) : isPdf && previewUrl ? (
          <div className="rounded-control border border-slate-200 overflow-hidden bg-slate-100">
            {/* Same-origin blob URL, so the browser's PDF viewer renders normally. */}
            <iframe
              src={previewUrl}
              title={`Resume preview for ${candidate.name}`}
              className="w-full h-[70vh] min-h-[420px] bg-white"
            />
          </div>
        ) : (
          <div className="rounded-control border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-meta text-slate-600">
              {isPlainText
                ? 'This resume is a plain-text document. The full extracted text is shown below.'
                : 'In-browser preview is only available for PDF resumes. Use Open or Download to view the original document.'}
            </p>
          </div>
        )}

      </div>
    </Card>
  );
};

export default CandidateResumeViewer;
