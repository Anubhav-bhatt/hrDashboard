import React, { useRef, useState } from 'react';
import { Mail, UploadCloud, ShieldCheck, ArrowDown, FolderPlus, FileText } from 'lucide-react';
import { cx, Button } from '../ui';

/**
 * Universal drop zone and paste surface for Outlook emails.
 * Supports drag-and-drop, clipboard paste, and multi-file selection.
 */
export const ResumeDropZone = ({ onFilesSelected, disabled = false }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    if (onFilesSelected) {
      onFilesSelected({ type: 'DROP', dataTransfer: e.dataTransfer });
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected?.({ type: 'INPUT', files: e.target.files });
    }
    // Reset file input so user can pick the same files again if needed
    e.target.value = '';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="text-center max-w-xl mx-auto space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Resume Extractor
        </h1>
        <p className="text-sm text-slate-600">
          Extract resume attachments from Outlook emails and save them directly to your device.
        </p>
      </div>

      {/* Main Action Area */}
      <div
        role="region"
        aria-label="Email drop and paste zone"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cx(
          'relative group rounded-card border-2 border-dashed p-8 sm:p-12 text-center transition-all duration-200 outline-none',
          isDragOver
            ? 'border-brand-500 bg-brand-50/60 ring-4 ring-brand-500/10 scale-[1.005]'
            : 'border-slate-300 hover:border-slate-400 bg-white/70 hover:bg-white shadow-soft',
          disabled && 'opacity-60 cursor-not-allowed pointer-events-none'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".msg,.eml,message/rfc822,application/vnd.ms-outlook,application/x-msg"
          className="sr-only"
          id="resume-extractor-file-input"
          aria-label="Choose email files from disk"
          onChange={handleFileInputChange}
          disabled={disabled}
        />

        <div className="flex flex-col items-center justify-center space-y-4 max-w-md mx-auto">
          {/* Animated or High-contrast Icon */}
          <div
            className={cx(
              'w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-200 shadow-sm',
              isDragOver
                ? 'bg-brand-600 text-white scale-110'
                : 'bg-brand-50 text-brand-600 group-hover:scale-105'
            )}
            aria-hidden="true"
          >
            {isDragOver ? (
              <ArrowDown className="w-8 h-8 animate-bounce" />
            ) : (
              <Mail className="w-8 h-8" />
            )}
          </div>

          {/* Prompt text */}
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">
              {isDragOver ? 'Drop emails to check attachments' : 'Paste or drop emails'}
            </h2>
            <p className="text-xs text-slate-500">
              <kbd className="font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-700">
                ⌘V
              </kbd>{' '}
              or{' '}
              <kbd className="font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-700">
                Ctrl+V
              </kbd>{' '}
              or drag Outlook emails here
            </p>
          </div>

          {/* Secondary fallback button */}
          <div className="pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 text-xs font-semibold shadow-xs"
            >
              <FolderPlus className="w-4 h-4 text-slate-500" aria-hidden="true" />
              <span>Choose Email Files</span>
            </Button>
          </div>

          <p className="text-[11px] text-slate-400">
            Accepts multiple <span className="font-medium text-slate-600">.msg</span> and{' '}
            <span className="font-medium text-slate-600">.eml</span> files
          </p>
        </div>
      </div>

      {/* Mini 3-Step Guide */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto pt-2 text-xs text-slate-600">
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-100/70 border border-slate-200/60">
          <span className="w-5 h-5 rounded-full bg-white border border-slate-300 font-bold text-[11px] flex items-center justify-center text-slate-700 shrink-0">
            1
          </span>
          <span>Select candidate emails in Outlook</span>
        </div>
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-100/70 border border-slate-200/60">
          <span className="w-5 h-5 rounded-full bg-white border border-slate-300 font-bold text-[11px] flex items-center justify-center text-slate-700 shrink-0">
            2
          </span>
          <span>Copy or drag them across</span>
        </div>
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-100/70 border border-slate-200/60">
          <span className="w-5 h-5 rounded-full bg-white border border-slate-300 font-bold text-[11px] flex items-center justify-center text-slate-700 shrink-0">
            3
          </span>
          <span>Save all resumes to your folder</span>
        </div>
      </div>

      {/* Privacy Guarantee Note */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 pt-1">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
        <span className="font-medium text-slate-600">
          Processed locally. Your emails and resumes are not uploaded.
        </span>
      </div>
    </div>
  );
};

export default ResumeDropZone;
