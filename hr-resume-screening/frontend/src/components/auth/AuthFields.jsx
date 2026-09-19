import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * The inputs both auth screens use.
 *
 * Shared so the two forms cannot drift on the things that are easy to get wrong
 * separately: the error is always associated with `aria-describedby`, the
 * invalid state is always announced, and the show/hide control always has a name
 * a screen reader can read.
 */

const errorId = (id) => `${id}-error`;

export const AuthField = ({
  id,
  label,
  icon: Icon,
  error,
  value,
  onChange,
  inputRef,
  type = 'text',
  autoComplete,
  placeholder,
  required = true,
  ...rest
}) => (
  <div>
    <label htmlFor={id} className="field-label">
      {label}{' '}
      {required && (
        <span className="text-rose-500" aria-hidden="true">
          *
        </span>
      )}
    </label>
    <div className="relative">
      {Icon && (
        <Icon className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" aria-hidden="true" />
      )}
      <input
        ref={inputRef}
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className={`input ${Icon ? 'pl-9' : ''} ${error ? 'input-error' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId(id) : undefined}
        {...rest}
      />
    </div>
    {error && (
      <p id={errorId(id)} className="text-xs text-rose-600 mt-1.5 font-medium">
        {error}
      </p>
    )}
  </div>
);

export const PasswordField = ({
  id = 'password',
  label = 'Password',
  icon: Icon,
  error,
  value,
  onChange,
  autoComplete = 'current-password',
  placeholder = '••••••••',
  hint,
  inputRef
}) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}{' '}
        <span className="text-rose-500" aria-hidden="true">
          *
        </span>
      </label>
      <div className="relative">
        {Icon && (
          <Icon className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          className={`input ${Icon ? 'pl-9' : ''} pr-10 ${error ? 'input-error' : ''}`}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId(id) : hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // 44px of tappable area, without changing how the control looks.
          className="absolute right-1 top-1 p-2.5 text-slate-400 hover:text-slate-700 rounded transition-colors duration-fast"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error ? (
        <p id={errorId(id)} className="text-xs text-rose-600 mt-1.5 font-medium">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-slate-500 mt-1.5">
            {hint}
          </p>
        )
      )}
    </div>
  );
};
