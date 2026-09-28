import React from 'react';
import { CheckCircle, FolderCheck, RotateCcw, Eye, Download, ShieldCheck } from 'lucide-react';
import { Button } from '../ui';

/**
 * Success state shown once extracted resumes have been written to the local folder or downloaded.
 */
export const ExtractionComplete = ({
  savedCount = 0,
  duplicateCount = 0,
  saveMethod = 'DIRECTORY', // 'DIRECTORY' | 'ZIP'
  destinationName = 'Selected folder',
  onExtractMore,
  onReviewResults
}) => {
  return (
    <div className="w-full max-w-xl mx-auto p-8 sm:p-10 rounded-card border border-emerald-200 bg-white shadow-soft text-center space-y-6 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
        <CheckCircle className="w-9 h-9" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Extraction complete
        </h2>
        <p className="text-sm font-semibold text-emerald-800">
          {savedCount} {savedCount === 1 ? 'resume' : 'resumes'} saved
          {duplicateCount > 0 ? ` • ${duplicateCount} duplicates skipped` : ''}
        </p>
      </div>

      {/* Destination card */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-left space-y-1">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
          {saveMethod === 'DIRECTORY' ? 'Saved to local folder:' : 'Downloaded as ZIP:'}
        </span>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {saveMethod === 'DIRECTORY' ? (
            <FolderCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <Download className="w-4 h-4 text-brand-600 shrink-0" />
          )}
          <span className="truncate">{destinationName}</span>
        </div>
        <p className="text-[11px] text-slate-500">
          {saveMethod === 'DIRECTORY'
            ? 'All extracted files were written to the chosen folder on your device.'
            : 'Unzip the archive to access all resumes inside the resumes/ folder.'}
        </p>
      </div>

      {/* Privacy confirmation */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>Emails and resumes processed entirely on your local device.</span>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={onReviewResults}
          className="w-full sm:w-auto text-xs font-semibold"
        >
          <Eye className="w-4 h-4 mr-1.5" />
          Review Results
        </Button>

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={onExtractMore}
          className="w-full sm:w-auto min-h-[44px] text-xs font-bold bg-brand-600 hover:bg-brand-500 text-white shadow-sm"
        >
          <RotateCcw className="w-4 h-4 mr-1.5" />
          Extract More Emails
        </Button>
      </div>
    </div>
  );
};

export default ExtractionComplete;
