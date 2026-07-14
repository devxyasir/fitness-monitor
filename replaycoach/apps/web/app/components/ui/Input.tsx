'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    const inputId = id ?? props.name ?? Math.random().toString(36).slice(2);
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-label text-ink-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`w-full bg-panel-2 border border-hairline rounded-sm px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-all duration-150 focus:outline-none focus-visible:border-brand focus-visible:shadow-focus ${error ? 'border-danger/50' : ''} ${className}`}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-xs text-danger animate-rise">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
