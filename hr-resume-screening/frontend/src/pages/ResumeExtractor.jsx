import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  detectClipboardInput,
  detectDroppedInput,
  detectSelectedFiles,
  processEmailBatch,
  saveResumesToDirectory,
  downloadResumesAsZip,
  isDirectoryPickerSupported
} from '../services/emailExtractor';
import ResumeDropZone from '../components/extractor/ResumeDropZone';
import ExtractorProgress from '../components/extractor/ExtractorProgress';
import ExtractionSummary from '../components/extractor/ExtractionSummary';
import ExtractedResumeTable from '../components/extractor/ExtractedResumeTable';
import ExtractionComplete from '../components/extractor/ExtractionComplete';
import ClipboardFallbackAlert from '../components/extractor/ClipboardFallbackAlert';
import { useToast } from '../components/ToastProvider';

/**
 * State machine stages:
 * 'IDLE' -> 'PROCESSING' -> 'READY' -> 'COMPLETE'
 */

export const ResumeExtractor = () => {
  const toast = useToast();

  const [stage, setStage] = useState('IDLE');
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0, currentEmailName: '' });
  const [emails, setEmails] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [ignored, setIgnored] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [clipboardAlert, setClipboardAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  const mainRef = useRef(null);

  // Set document title
  useEffect(() => {
    document.title = 'Resume Extractor | HR Recruitment Platform';
  }, []);

  /**
   * Cleans up all state and transient byte buffers to avoid memory leaks.
   */
  const handleReset = useCallback(() => {
    setEmails([]);
    setResumes([]);
    setDuplicates([]);
    setIgnored([]);
    setMetrics({});
    setWarnings([]);
    setClipboardAlert(null);
    setProgress({ current: 0, total: 0, percentage: 0, currentEmailName: '' });
    setSaving(false);
    setSaveResult(null);
    setStage('IDLE');
  }, []);

  /**
   * Runs the batch ingestion pipeline on detected email files.
   */
  const handleRunPipeline = useCallback(async (files, sourceType = 'drag-drop') => {
    if (!files || files.length === 0) return;

    setStage('PROCESSING');
    setProgress({ current: 0, total: files.length, percentage: 0, currentEmailName: files[0]?.name || '' });
    setClipboardAlert(null);

    try {
      const result = await processEmailBatch(files, {
        sourceType,
        onProgress: (p) => setProgress(p)
      });

      setEmails(result.emails);
      setResumes(result.resumes);
      setDuplicates(result.duplicates);
      setIgnored(result.ignored);
      setMetrics(result.metrics);
      setWarnings(result.warnings);

      setStage('READY');

      if (result.metrics.resumesFound === 0) {
        toast.info('Emails analyzed. No resume attachments were found.');
      } else {
        toast.success(`Found ${result.metrics.resumesFound} candidate resume${result.metrics.resumesFound === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to analyze email batch.');
      setStage('IDLE');
    }
  }, [toast]);

  /**
   * Global and local paste listener.
   */
  useEffect(() => {
    const handlePaste = (e) => {
      // Do not intercept if user is typing into an input, textarea, or contentEditable element
      const target = e.target;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (!e.clipboardData) return;

      const detection = detectClipboardInput(e.clipboardData);

      if (detection.kind === 'FILES' && detection.files?.length > 0) {
        e.preventDefault();
        handleRunPipeline(detection.files, 'paste');
      } else if (detection.kind === 'UNSUPPORTED_CLIPBOARD_TEXT') {
        e.preventDefault();
        setClipboardAlert({
          message: detection.message,
          suggestion: detection.suggestion
        });
      } else if (detection.kind === 'NON_EMAIL_FILES') {
        e.preventDefault();
        setClipboardAlert({
          message: detection.message,
          suggestion: detection.suggestion
        });
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleRunPipeline]);

  /**
   * Handles files dropped or selected via dropzone.
   */
  const handleFilesSelected = async (event) => {
    if (event.type === 'DROP') {
      const detection = await detectDroppedInput(event.dataTransfer);
      if (detection.kind === 'FILES' && detection.files?.length > 0) {
        handleRunPipeline(detection.files, 'drag-drop');
      } else if (detection.kind === 'NON_EMAIL_FILES') {
        setClipboardAlert({
          message: detection.message,
          suggestion: detection.suggestion
        });
      }
    } else if (event.type === 'INPUT') {
      const detection = detectSelectedFiles(event.files);
      if (detection.kind === 'FILES' && detection.files?.length > 0) {
        handleRunPipeline(detection.files, 'file-picker');
      } else if (detection.kind === 'NON_EMAIL_FILES') {
        setClipboardAlert({
          message: detection.message,
          suggestion: detection.suggestion
        });
      }
    }
  };

  /**
   * Toggles inclusion of a single resume item.
   */
  const handleToggleSelect = (id) => {
    setResumes((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleSelectAll = () => {
    setResumes((prev) => prev.map((item) => ({ ...item, selected: true })));
  };

  const handleDeselectAll = () => {
    setResumes((prev) => prev.map((item) => ({ ...item, selected: false })));
  };

  const selectedResumes = resumes.filter((r) => r.selected);

  /**
   * Action: Save to local folder (Directory Picker) or fallback to ZIP.
   */
  const handleSaveToDirectory = async () => {
    if (selectedResumes.length === 0) {
      toast.warning('No resumes selected to save.');
      return;
    }

    setSaving(true);

    if (isDirectoryPickerSupported()) {
      const result = await saveResumesToDirectory(selectedResumes);

      if (result.status === 'SAVED') {
        setSaving(false);
        setSaveResult({
          method: 'DIRECTORY',
          count: result.count,
          destination: result.folderName || 'Selected folder'
        });
        setStage('COMPLETE');
        toast.success(`Successfully saved ${result.count} resumes to your folder.`);
      } else if (result.status === 'CANCELLED') {
        // User dismissed the folder dialog — keep user in READY state
        setSaving(false);
      } else if (result.status === 'PERMISSION_DENIED') {
        setSaving(false);
        toast.error('Folder permission was denied. Downloading as ZIP instead.');
        handleSaveAsZip();
      } else {
        setSaving(false);
        toast.warning('Direct folder save failed. Falling back to ZIP download.');
        handleSaveAsZip();
      }
    } else {
      // Browser does not support showDirectoryPicker (e.g. Firefox, Safari)
      toast.info('Your browser does not support direct folder saving. Downloading as one ZIP archive.');
      handleSaveAsZip();
    }
  };

  /**
   * Action: Client-side ZIP fallback.
   */
  const handleSaveAsZip = async () => {
    if (selectedResumes.length === 0) return;

    setSaving(true);
    const result = await downloadResumesAsZip(selectedResumes);
    setSaving(false);

    if (result.status === 'SAVED') {
      setSaveResult({
        method: 'ZIP',
        count: result.count,
        destination: result.fileName
      });
      setStage('COMPLETE');
      toast.success(`Generated ZIP archive with ${result.count} resumes.`);
    } else {
      toast.error(result.message || 'Failed to generate ZIP archive.');
    }
  };

  return (
    <div ref={mainRef} className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Clipboard Fallback / Non-email notification */}
      {clipboardAlert && (
        <ClipboardFallbackAlert
          message={clipboardAlert.message}
          suggestion={clipboardAlert.suggestion}
          onDismiss={() => setClipboardAlert(null)}
        />
      )}

      {/* Warnings if any */}
      {warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
          {warnings.map((w, idx) => (
            <p key={idx}>{w}</p>
          ))}
        </div>
      )}

      {/* 1. Empty / Drop Zone State */}
      {stage === 'IDLE' && (
        <div className="pt-4 sm:pt-8 animate-fade-in">
          <ResumeDropZone onFilesSelected={handleFilesSelected} />
        </div>
      )}

      {/* 2. Processing State */}
      {stage === 'PROCESSING' && (
        <div className="pt-12 sm:pt-16">
          <ExtractorProgress
            current={progress.current}
            total={progress.total}
            currentEmailName={progress.currentEmailName}
          />
        </div>
      )}

      {/* 3. Ready State: Summary Cards & Confidence Table */}
      {stage === 'READY' && (
        <div className="space-y-6 animate-fade-in">
          <ExtractionSummary
            metrics={metrics}
            selectedCount={selectedResumes.length}
            onSaveResumes={handleSaveToDirectory}
            onSaveZip={handleSaveAsZip}
            onReset={handleReset}
            saving={saving}
          />

          <ExtractedResumeTable
            resumes={resumes}
            duplicates={duplicates}
            ignored={ignored}
            emails={emails}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
          />
        </div>
      )}

      {/* 4. Complete State */}
      {stage === 'COMPLETE' && saveResult && (
        <div className="pt-8 animate-fade-in">
          <ExtractionComplete
            savedCount={saveResult.count}
            duplicateCount={metrics.duplicatesCount || 0}
            saveMethod={saveResult.method}
            destinationName={saveResult.destination}
            onExtractMore={handleReset}
            onReviewResults={() => setStage('READY')}
          />
        </div>
      )}
    </div>
  );
};

export default ResumeExtractor;
