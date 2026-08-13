import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { SkillChip, cx } from './index';

/**
 * Token list with an inline add-popover.
 *
 * Used for skills, keywords, locations and qualifications so all four behave
 * identically. A popover rather than a modal: adding one short value should not
 * take over the screen.
 *
 * Keyboard contract:
 *   Enter        add the typed value, or the highlighted suggestion
 *   ArrowDown/Up move through suggestions
 *   Escape       close and return focus to the Add button
 *   Tab          leaves the popover, which closes it
 *
 * Free text is always allowed — suggestions are a shortcut, not a whitelist.
 * Duplicates are rejected case-insensitively with visible feedback.
 *
 * @param {Object} props
 * @param {string} props.id Unique id, used to associate the input and listbox
 * @param {string} props.label
 * @param {string} [props.description]
 * @param {string[]} props.values
 * @param {Function} props.onChange Receives the next array
 * @param {string[]} [props.suggestions]
 * @param {string} [props.placeholder]
 * @param {string} [props.addLabel]
 * @param {'default'|'keyword'} [props.tone]
 * @param {boolean} [props.matchedHighlight] Render chips in the matched style
 * @param {boolean} [props.disabled]
 */
const TokenInput = ({
  id,
  label,
  description,
  values = [],
  onChange,
  suggestions = [],
  placeholder = 'Type a value…',
  addLabel = 'Add',
  tone = 'default',
  disabled = false,
  className
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [highlighted, setHighlighted] = useState(-1);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const addButtonRef = useRef(null);

  // Suggestions not already chosen, filtered by what has been typed.
  const filtered = useMemo(() => {
    const chosen = new Set(values.map((v) => v.toLowerCase()));
    const query = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => !chosen.has(s.toLowerCase()))
      .filter((s) => (query ? s.toLowerCase().includes(query) : true))
      .slice(0, 6);
  }, [suggestions, values, draft]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close when focus or a click leaves the control.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  });

  const close = ({ returnFocus = false } = {}) => {
    setOpen(false);
    setDraft('');
    setError('');
    setHighlighted(-1);
    if (returnFocus) addButtonRef.current?.focus();
  };

  const add = (raw) => {
    const value = String(raw ?? draft).trim();
    if (!value) {
      setError('Enter a value first.');
      return;
    }

    // Case-insensitive duplicate check, so React / react / REACT cannot all be
    // added separately.
    const existing = values.find((v) => v.toLowerCase() === value.toLowerCase());
    if (existing) {
      setError(`${existing} is already included.`);
      return;
    }

    onChange([...values, value]);
    setDraft('');
    setError('');
    setHighlighted(-1);
    // Stay open so several values can be added in a row.
    inputRef.current?.focus();
  };

  const remove = (index) => onChange(values.filter((_, i) => i !== index));

  const onKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add(highlighted >= 0 && filtered[highlighted] ? filtered[highlighted] : draft);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close({ returnFocus: true });
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((i) => (filtered.length ? (i + 1) % filtered.length : -1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : -1));
      return;
    }

    // Backspace on an empty field removes the last token, as token inputs do.
    if (event.key === 'Backspace' && !draft && values.length) {
      remove(values.length - 1);
    }
  };

  return (
    <div className={className} ref={containerRef}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-meta font-semibold text-slate-900">
            {label}
            {values.length > 0 && <span className="text-slate-400 font-normal"> ({values.length})</span>}
          </p>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        {values.map((value, index) => (
          <SkillChip
            key={`${value}-${index}`}
            keyword={tone === 'keyword'}
            onRemove={disabled ? undefined : () => remove(index)}
          >
            {value}
          </SkillChip>
        ))}

        <div className="relative">
          <button
            ref={addButtonRef}
            type="button"
            onClick={() => (open ? close({ returnFocus: true }) : setOpen(true))}
            disabled={disabled}
            aria-expanded={open}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill border border-dashed border-slate-300
                       text-xs font-semibold text-slate-500 hover:text-brand-700 hover:border-brand-300
                       hover:bg-brand-50 transition-colors duration-fast disabled:opacity-50"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
            {addLabel}
          </button>

          {open && (
            <div
              role="dialog"
              aria-label={`Add ${label.toLowerCase()}`}
              className="absolute left-0 top-full mt-2 z-40 w-64 card p-3 animate-scale-in"
              style={{ boxShadow: 'var(--shadow-overlay)' }}
            >
              <label htmlFor={`${id}-input`} className="field-label">
                {addLabel}
              </label>

              <input
                ref={inputRef}
                id={`${id}-input`}
                type="text"
                className={cx('input h-9', error && 'input-error')}
                placeholder={placeholder}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError('');
                  setHighlighted(-1);
                }}
                onKeyDown={onKeyDown}
                role="combobox"
                aria-expanded={filtered.length > 0}
                aria-controls={`${id}-listbox`}
                aria-activedescendant={highlighted >= 0 ? `${id}-option-${highlighted}` : undefined}
                aria-autocomplete="list"
              />

              {error && (
                <p className="text-xs text-rose-600 mt-1.5 font-medium" role="alert">
                  {error}
                </p>
              )}

              {filtered.length > 0 && (
                <>
                  <p className="text-label uppercase text-slate-400 mt-3 mb-1">Suggestions</p>
                  <ul id={`${id}-listbox`} role="listbox" className="max-h-40 overflow-y-auto scroll-slim -mx-1">
                    {filtered.map((suggestion, index) => (
                      <li key={suggestion} role="none">
                        <button
                          type="button"
                          id={`${id}-option-${index}`}
                          role="option"
                          aria-selected={index === highlighted}
                          onClick={() => add(suggestion)}
                          onMouseEnter={() => setHighlighted(index)}
                          className={cx(
                            'w-full text-left px-2 py-1.5 rounded text-meta transition-colors duration-fast',
                            index === highlighted
                              ? 'bg-brand-50 text-brand-800'
                              : 'text-slate-700 hover:bg-slate-100'
                          )}
                        >
                          {suggestion}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <p className="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-100">
                <kbd className="font-sans font-semibold text-slate-500">Enter</kbd> to add ·{' '}
                <kbd className="font-sans font-semibold text-slate-500">Esc</kbd> to close
              </p>
            </div>
          )}
        </div>
      </div>

      {values.length === 0 && !open && <p className="text-xs text-slate-400 italic mt-1.5">None added yet.</p>}
    </div>
  );
};

export default TokenInput;
