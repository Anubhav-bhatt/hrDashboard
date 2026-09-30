import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cx } from './index';

/**
 * Flexible Inline Token / Tag Input.
 *
 * Designed for effortless skills, keywords, locations and qualifications entry:
 *   - Type value and press Enter
 *   - Type comma (,) to immediately create tag
 *   - Paste comma- or newline-separated text (e.g. "React, JavaScript, TypeScript") to create multiple tags
 *   - Lightweight autocomplete suggestions dropdown
 *   - Backspace on empty field removes previous tag
 *   - No separate "None added yet" message (clean placeholder-driven empty state)
 *   - Compact, neutral tag design
 *
 * @param {Object} props
 * @param {string} props.id Unique id, used to associate input and listbox
 * @param {string} [props.label] Field label
 * @param {string} [props.badge] Optional badge (e.g. "Optional")
 * @param {string} [props.description] Help / supporting text
 * @param {string[]} props.values Array of tag strings
 * @param {Function} props.onChange Callback receiving updated array
 * @param {string[]} [props.suggestions] Autocomplete suggestions list
 * @param {string} [props.placeholder] Input placeholder when empty
 * @param {'default'|'keyword'} [props.tone]
 * @param {boolean} [props.disabled] Disabled state
 * @param {string} [props.className] Additional class names
 */
const TokenInput = ({
  id,
  label,
  badge,
  description,
  values = [],
  onChange,
  suggestions = [],
  placeholder = 'Add a value...',
  disabled = false,
  className
}) => {
  const [draft, setDraft] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);

  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Suggestions not already chosen, filtered by typed draft
  const filtered = useMemo(() => {
    const chosen = new Set(values.map((v) => v.toLowerCase().trim()));
    const query = draft.trim().toLowerCase();
    if (!query) return [];
    return suggestions
      .filter((s) => !chosen.has(s.toLowerCase()))
      .filter((s) => s.toLowerCase().includes(query))
      .slice(0, 6);
  }, [suggestions, values, draft]);

  // Close suggestions if clicked outside
  useEffect(() => {
    const onMouseDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsFocused(false);
        setHighlighted(-1);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const addValues = (rawItems) => {
    const existingSet = new Set(values.map((v) => v.toLowerCase().trim()));
    const newToAdd = [];

    for (const raw of rawItems) {
      const val = String(raw || '').trim();
      if (!val) continue;
      const lower = val.toLowerCase();
      if (!existingSet.has(lower)) {
        existingSet.add(lower);
        newToAdd.push(val);
      }
    }

    if (newToAdd.length > 0) {
      onChange([...values, ...newToAdd]);
    }
    setDraft('');
    setHighlighted(-1);
  };

  const remove = (index) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    // Comma trigger: commit text before comma
    if (val.includes(',')) {
      const parts = val.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        addValues(parts);
      } else {
        setDraft('');
      }
      return;
    }
    setDraft(val);
    setHighlighted(-1);
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData?.getData('text');
    if (pasted && (pasted.includes(',') || pasted.includes('\n'))) {
      e.preventDefault();
      const parts = pasted.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        addValues(parts);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && filtered[highlighted]) {
        addValues([filtered[highlighted]]);
      } else if (draft.trim()) {
        addValues([draft.trim()]);
      }
      return;
    }

    if (e.key === 'Backspace' && !draft && values.length > 0) {
      remove(values.length - 1);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => (filtered.length ? (i + 1) % filtered.length : -1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : -1));
      return;
    }

    if (e.key === 'Escape') {
      setHighlighted(-1);
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className={cx('space-y-1.5', className)} ref={containerRef}>
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${id}-input`} className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
            {label}
            {badge && (
              <span className="text-[11px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {badge}
              </span>
            )}
          </label>
          {values.length > 0 && (
            <span className="text-[11px] text-slate-400 font-normal">
              {values.length} {values.length === 1 ? 'skill' : 'skills'}
            </span>
          )}
        </div>
      )}

      {description && <p className="text-xs text-slate-500">{description}</p>}

      {/* Unified Tag Input Box */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={cx(
          'min-h-[40px] w-full rounded-lg border bg-white px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 transition-colors cursor-text',
          isFocused ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300',
          disabled && 'opacity-60 cursor-not-allowed bg-slate-50'
        )}
      >
        {/* Render compact tags */}
        {values.map((val, idx) => (
          <span
            key={`${val}-${idx}`}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200/80 select-none animate-scale-in"
          >
            <span>{val}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(idx);
                }}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 rounded p-0.5 transition-colors ml-0.5"
                aria-label={`Remove ${val}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {/* Integrated inline input */}
        <div className="relative flex-1 min-w-[130px]">
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="text"
            disabled={disabled}
            value={draft}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              // Auto-commit draft on blur if text is present
              if (draft.trim()) {
                addValues([draft.trim()]);
              }
            }}
            placeholder={values.length === 0 ? placeholder : 'Add another...'}
            className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none h-6"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isFocused && filtered.length > 0}
            aria-controls={`${id}-listbox`}
          />

          {/* Autocomplete Suggestions Menu */}
          {isFocused && filtered.length > 0 && (
            <ul
              id={`${id}-listbox`}
              role="listbox"
              className="absolute left-0 top-full mt-1.5 z-50 min-w-[190px] max-w-[260px] max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg scroll-slim animate-scale-in"
            >
              {filtered.map((suggestion, index) => (
                <li
                  key={suggestion}
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent input blur before committing
                    addValues([suggestion]);
                  }}
                  onMouseEnter={() => setHighlighted(index)}
                  className={cx(
                    'cursor-pointer px-2.5 py-1.5 text-xs rounded-md transition-colors flex items-center justify-between',
                    index === highlighted ? 'bg-brand-50 text-brand-800 font-medium' : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <span>{suggestion}</span>
                  <Plus className="w-3 h-3 text-slate-400" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenInput;
