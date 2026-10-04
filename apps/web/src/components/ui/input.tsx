import * as React from 'react';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const inputClassName =
  'h-9 w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-60';

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = '', ...props }, ref) => (
  <input ref={ref} className={[inputClassName, className].join(' ')} {...props} />
));

Input.displayName = 'Input';
