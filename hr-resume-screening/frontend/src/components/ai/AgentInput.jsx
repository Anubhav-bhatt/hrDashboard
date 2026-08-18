import React, { useId, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button, cx } from '../ui';

/**
 * The instruction field that sits at the foot of an agent workspace.
 *
 * One control, shared by all five agents, so "ask or refine" is always in the
 * same place. Enter submits and Shift+Enter adds a line, which is the convention
 * for a message box; a recruiter typing a two-line instruction should not have to
 * hunt for the button.
 *
 * The label is real and tied to the field — visually hidden only where the
 * placeholder already carries the meaning, never absent. The send button keeps an
 * accessible name of its own because it renders as an icon on narrow screens.
 *
 * `disabled` with `disabledHint` is how a page says "not yet": the field stays
 * visible so the workflow is legible, and the hint explains why it cannot be used
 * rather than leaving a dead control.
 */
const AgentInput = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Ask or give additional instructions…',
  label = 'Instruction for the agent',
  hideLabel = true,
  disabled = false,
  disabledHint,
  submitLabel = 'Send',
  busy = false,
  className
}) => {
  const generatedId = useId();
  const fieldId = `agent-input-${generatedId}`;
  const hintId = `${fieldId}-hint`;

  // Uncontrolled by default so a page that does not care about the value can
  // drop the component in without wiring state.
  const [internal, setInternal] = useState('');
  const isControlled = value !== undefined;
  const text = isControlled ? value : internal;

  const setText = (next) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  const submit = () => {
    const trimmed = (text || '').trim();
    if (!trimmed || disabled || busy) return;
    onSubmit?.(trimmed);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className={cx('card card-pad-sm', className)}>
      <label htmlFor={fieldId} className={hideLabel ? 'sr-only' : 'field-label'}>
        {label}
      </label>

      <div className="flex items-end gap-2">
        <textarea
          id={fieldId}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={disabled && disabledHint ? hintId : undefined}
          className="textarea flex-1 min-h-[2.5rem] max-h-40 resize-y disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <Button
          variant="primary"
          size="icon"
          icon={ArrowRight}
          onClick={submit}
          loading={busy}
          disabled={disabled || !(text || '').trim()}
          aria-label={submitLabel}
          title={submitLabel}
        />
      </div>

      {disabled && disabledHint && (
        <p id={hintId} className="text-xs text-slate-500 mt-2">
          {disabledHint}
        </p>
      )}
    </div>
  );
};

export default AgentInput;
