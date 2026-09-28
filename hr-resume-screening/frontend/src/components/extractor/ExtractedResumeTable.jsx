import React, { useState } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Copy,
  AlertCircle,
  FileQuestion,
  Filter,
  Eye,
  Lock
} from 'lucide-react';
import { cx, Badge } from '../ui';

function formatBytes(bytes = 0) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Compact confidence table showing extracted resumes and details on demand.
 */
export const ExtractedResumeTable = ({
  resumes = [],
  duplicates = [],
  ignored = [],
  emails = [],
  onToggleSelect,
  onSelectAll,
  onDeselectAll
}) => {
  const [activeTab, setActiveTab] = useState('resumes'); // 'resumes' | 'duplicates' | 'ignored' | 'all-emails'
  const [expandedRowId, setExpandedRowId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const allSelected = resumes.length > 0 && resumes.every((r) => r.selected);
  const someSelected = resumes.some((r) => r.selected);

  const handleHeaderCheckboxChange = () => {
    if (allSelected) {
      onDeselectAll?.();
    } else {
      onSelectAll?.();
    }
  };

  return (
    <div className="w-full rounded-card border border-slate-200 bg-white shadow-soft overflow-hidden animate-fade-in">
      {/* Table Navigation Header / Filter Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('resumes')}
            className={cx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
              activeTab === 'resumes'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            )}
          >
            Resumes ({resumes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('duplicates')}
            className={cx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
              activeTab === 'duplicates'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            )}
          >
            Duplicates ({duplicates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ignored')}
            className={cx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
              activeTab === 'ignored'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            )}
          >
            Ignored Inline ({ignored.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('all-emails')}
            className={cx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
              activeTab === 'all-emails'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            )}
          >
            All Emails ({emails.length})
          </button>
        </div>

        {activeTab === 'resumes' && (
          <div className="text-xs text-slate-500 font-medium">
            Click row to view email details
          </div>
        )}
      </div>

      {/* 1. Resumes Tab */}
      {activeTab === 'resumes' && (
        <div className="overflow-x-auto">
          {resumes.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No resume attachments found in the analyzed emails.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={handleHeaderCheckboxChange}
                      aria-label="Select all resumes"
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  <th className="px-4 py-3">Email / Sender</th>
                  <th className="px-4 py-3">Resume File</th>
                  <th className="px-3 py-3">Format</th>
                  <th className="px-3 py-3">Size</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="w-10 px-3 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resumes.map((item) => {
                  const isExpanded = expandedRowId === item.id;
                  const formatName = (item.extension || '').replace('.', '').toUpperCase() || 'FILE';

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        className={cx(
                          'hover:bg-slate-50/80 transition-colors cursor-pointer',
                          item.selected ? 'bg-white' : 'bg-slate-50/40 text-slate-400'
                        )}
                        onClick={() => toggleExpand(item.id)}
                      >
                        <td
                          className="px-3 py-3 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(item.selected)}
                            onChange={() => onToggleSelect?.(item.id)}
                            aria-label={`Select ${item.safeFileName}`}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <div className="truncate max-w-[200px]" title={item.senderName || item.senderEmail}>
                            {item.senderName || 'Unknown Sender'}
                          </div>
                          {item.senderEmail && (
                            <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                              {item.senderEmail}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" />
                            <span className="font-semibold text-slate-800 truncate max-w-[240px]" title={item.safeFileName}>
                              {item.safeFileName}
                            </span>
                            {item.isProtected && (
                              <span title="Password Protected" className="text-amber-600">
                                <Lock className="w-3.5 h-3.5 shrink-0" />
                              </span>
                            )}
                          </div>
                          {item.safeFileName !== item.originalFileName && (
                            <span className="text-[10px] text-slate-400 block truncate">
                              Renamed from: {item.originalFileName}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {formatName}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-500 font-mono text-[11px]">
                          {formatBytes(item.size)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                            <CheckCircle2 className="w-3 h-3" />
                            Ready
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(item.id);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>

                      {/* Details on demand */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 border-t border-b border-slate-200/80">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div>
                                <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                                  Email Context
                                </h4>
                                <p className="text-slate-800">
                                  <span className="font-semibold text-slate-500">Subject:</span>{' '}
                                  {item.subject || '(No Subject)'}
                                </p>
                                <p className="text-slate-800 mt-0.5">
                                  <span className="font-semibold text-slate-500">Sender:</span>{' '}
                                  {item.senderName} ({item.senderEmail || 'N/A'})
                                </p>
                                <p className="text-slate-800 mt-0.5">
                                  <span className="font-semibold text-slate-500">Source File:</span>{' '}
                                  {item.sourceFileName}
                                </p>
                              </div>

                              <div>
                                <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                                  Attachment Details
                                </h4>
                                <p className="text-slate-800">
                                  <span className="font-semibold text-slate-500">Classification:</span>{' '}
                                  {item.classification} ({item.reason})
                                </p>
                                <p className="text-slate-800 mt-0.5 font-mono text-[11px] truncate">
                                  <span className="font-semibold font-sans text-slate-500">SHA-256:</span>{' '}
                                  {item.contentHash || 'N/A'}
                                </p>
                                <p className="text-slate-800 mt-0.5">
                                  <span className="font-semibold text-slate-500">MIME Type:</span>{' '}
                                  {item.mimeType}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 2. Duplicates Tab */}
      {activeTab === 'duplicates' && (
        <div className="overflow-x-auto">
          {duplicates.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No duplicate resumes detected. All extracted resumes are distinct.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Sender</th>
                  <th className="px-4 py-3">Source Message</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">SHA-256 Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {duplicates.map((dup) => (
                  <tr key={dup.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {dup.originalFileName}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {dup.senderName || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[200px]" title={dup.sourceFileName}>
                      {dup.sourceFileName}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                        <Copy className="w-3 h-3" />
                        Skipped Duplicate
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400 truncate max-w-[150px]">
                      {dup.contentHash ? dup.contentHash.slice(0, 16) + '...' : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 3. Ignored Inline Tab */}
      {activeTab === 'ignored' && (
        <div className="overflow-x-auto">
          {ignored.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No inline images or signature files were ignored.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Reason Ignored</th>
                  <th className="px-4 py-3">Source Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ignored.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {item.originalFileName}
                    </td>
                    <td className="px-4 py-3 text-slate-500 uppercase font-mono text-[11px]">
                      {item.extension || 'media'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                      {formatBytes(item.size)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.reason}
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[200px]" title={item.sourceFileName}>
                      {item.sourceFileName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 4. All Emails Tab */}
      {activeTab === 'all-emails' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Source File</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Sender</th>
                <th className="px-4 py-3">Attachments</th>
                <th className="px-4 py-3">Read Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {emails.map((em) => {
                const isError = em.parseStatus === 'ERROR';
                const attCount = em.attachments?.length || 0;

                return (
                  <tr key={em.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {em.sourceFileName}
                    </td>
                    <td className="px-4 py-3 text-slate-700 truncate max-w-[250px]" title={em.subject}>
                      {em.subject || '(No Subject)'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {em.senderName || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {attCount} attachment{attCount === 1 ? '' : 's'}
                    </td>
                    <td className="px-4 py-3">
                      {isError ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                          <AlertCircle className="w-3 h-3" />
                          {em.parseError || 'Could not read'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Parsed
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExtractedResumeTable;
