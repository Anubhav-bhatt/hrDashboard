import React from 'react';
import { Download, FolderDown, RotateCcw, AlertTriangle, FileCheck, Layers, FileX } from 'lucide-react';
import { Button } from '../ui';

/**
 * Top summary cards and primary action button for extracted resumes.
 */
export const ExtractionSummary = ({
  metrics = {},
  selectedCount = 0,
  onSaveResumes,
  onSaveZip,
  onReset,
  saving = false
}) => {
  const {
    emailsChecked = 0,
    resumesFound = 0,
    duplicatesCount = 0,
    couldNotAccessCount = 0,
    noAttachmentsCount = 0
  } = metrics;

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* 4 Clean Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1: Emails Checked */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Emails Checked</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{emailsChecked}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {noAttachmentsCount > 0 ? `${noAttachmentsCount} had no attachments` : 'All emails analyzed'}
          </p>
        </div>

        {/* Metric 2: Resumes Found */}
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-soft">
          <div className="flex items-center justify-between text-emerald-800 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Resumes Found</span>
            <FileCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-950">{resumesFound}</div>
          <p className="text-[11px] text-emerald-700/80 mt-0.5">
            {selectedCount} selected for saving
          </p>
        </div>

        {/* Metric 3: Duplicates */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Duplicates</span>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
              Skipped
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-800">{duplicatesCount}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Identical content removed
          </p>
        </div>

        {/* Metric 4: Could Not Access */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Could Not Access</span>
            {couldNotAccessCount > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            ) : (
              <FileX className="w-4 h-4 text-slate-400" />
            )}
          </div>
          <div className="text-2xl font-bold text-slate-800">{couldNotAccessCount}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {couldNotAccessCount > 0 ? 'Unsupported or unreadable' : 'Zero read errors'}
          </p>
        </div>
      </div>

      {/* Dominant Action Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 sm:p-5 rounded-card bg-slate-900 text-white shadow-md">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-base font-bold text-white">
            {selectedCount > 0 ? `Ready to extract ${selectedCount} resumes` : 'No resumes selected'}
          </h3>
          <p className="text-xs text-slate-300">
            Files will be written to one local folder on your device.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={saving}
            className="text-slate-300 hover:text-white hover:bg-slate-800 text-xs"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Reset
          </Button>

          {/* Fallback ZIP action if needed */}
          {onSaveZip && (
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onSaveZip}
              disabled={selectedCount === 0 || saving}
              className="text-xs font-semibold bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Download ZIP
            </Button>
          )}

          {/* Primary Dominant Button: 44px min height */}
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={onSaveResumes}
            disabled={selectedCount === 0 || saving}
            loading={saving}
            className="w-full sm:w-auto min-h-[44px] px-6 text-sm font-bold shadow-lg shadow-brand-500/20 bg-brand-600 hover:bg-brand-500 text-white"
          >
            <FolderDown className="w-5 h-5 mr-2" aria-hidden="true" />
            <span>Save {selectedCount} Resumes</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ExtractionSummary;
