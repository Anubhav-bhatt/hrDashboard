import React, { useRef, useState } from 'react';
import { CheckCircle2, FileText, UploadCloud, X } from 'lucide-react';
import { Button, cx } from './index';
import { formatFileSize } from '../../utils/format';

/**
 * Drag-and-drop file input.
 *
 * The native file input is kept in the DOM but visually hidden, so the control
 * remains fully keyboard and screen-reader operable while presenting a proper
 * drop target. Selected files are shown as a confirmed list rather than leaving
 * the browser's default "no file chosen" text on screen.
 *
 * @param {Object} props
 * @param {string} props.id Input id, needed to bind the label
 * @param {string} [props.accept] Accept attribute, e.g. ".pdf,.docx,.txt"
 * @param {boolean} [props.multiple]
 * @param {boolean} [props.directory] Allow selecting a whole folder
 * @param {string} props.title Primary instruction
 * @param {string} [props.hint] Supporting line (formats, size limit)
 * @param {File[]} [props.files] Currently selected files
 * @param {Function} props.onFiles Receives a File[]
 * @param {Function} [props.onClear]
 * @param {string} [props.error]
 * @param {boolean} [props.disabled]
 */
const FileDropZone = ({
  id,
  accept,
  multiple = false,
  directory = false,
  title,
  hint,
  files = [],
  onFiles,
  onClear,
  error,
  disabled = false,
  className
}) => {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    if (disabled) return;
    const dropped = Array.from(event.dataTransfer?.files || []);
    if (dropped.length) onFiles(multiple ? dropped : [dropped[0]]);
  };

  const clear = () => {
    if (inputRef.current) inputRef.current.value = '';
    onClear?.();
  };

  const hasFiles = files.length > 0;

  if (hasFiles && !multiple) {
    const file = files[0];
    return (
      <div className={cx('rounded-card border border-slate-200 bg-slate-50 p-4', className)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-control bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-meta font-semibold text-slate-900 truncate">{file.name}</p>
              <p className="text-xs text-slate-500">{formatFileSize(file.size)} · Ready</p>
            </div>
          </div>
          {onClear && (
            <Button variant="ghost" size="iconSm" icon={X} onClick={clear} disabled={disabled} aria-label="Remove selected file" />
          )}
        </div>
        {error && <p className="text-xs text-rose-600 mt-2 font-medium">{error}</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDrop={handleDrop}
        className={cx(
          'border-2 border-dashed rounded-card px-6 py-8 text-center transition-colors duration-fast',
          dragActive ? 'border-brand-500 bg-brand-50/60' : 'border-slate-300 bg-slate-50/60',
          !disabled && !dragActive && 'hover:bg-slate-100/60 hover:border-slate-400',
          error && 'border-rose-300 bg-rose-50/40',
          disabled && 'opacity-60'
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          {...(directory ? { webkitdirectory: 'true', directory: '' } : {})}
          onChange={(e) => {
            const selected = Array.from(e.target.files || []);
            if (selected.length) onFiles(selected);
          }}
          className="sr-only"
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />

        <label htmlFor={id} className={cx('block', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
          <span className="mx-auto w-11 h-11 bg-white rounded-pill border border-slate-200 flex items-center justify-center shadow-card mb-3">
            <UploadCloud className="w-5 h-5 text-brand-600" aria-hidden="true" />
          </span>
          <span className="text-card-title text-slate-900 block">{title}</span>
          {hint && (
            <span id={`${id}-hint`} className="text-xs text-slate-500 mt-1 block">
              {hint}
            </span>
          )}
        </label>
      </div>

      {/* Multi-file selections are summarised rather than listed in full. */}
      {hasFiles && multiple && (
        <div className="mt-3 rounded-card border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-control bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-meta font-semibold text-slate-900">
                {files.length.toLocaleString('en-IN')} file{files.length === 1 ? '' : 's'} selected
              </p>
              <p className="text-xs text-slate-500">
                {formatFileSize(files.reduce((sum, f) => sum + (f.size || 0), 0))} total
              </p>
            </div>
          </div>
          {onClear && (
            <Button variant="ghost" size="sm" icon={X} onClick={clear} disabled={disabled}>
              Clear
            </Button>
          )}
        </div>
      )}

      {error && (
        <p id={`${id}-error`} className="text-xs text-rose-600 mt-1.5 font-medium">
          {error}
        </p>
      )}
    </div>
  );
};

export default FileDropZone;
