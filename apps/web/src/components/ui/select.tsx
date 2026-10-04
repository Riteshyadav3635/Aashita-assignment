import * as React from 'react';
import { ChevronDown } from 'lucide-react';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const selectClassName =
  'h-9 w-full appearance-none rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 pr-8 text-sm text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60';

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className = '', children, ...props }, ref) => (
  <div className="relative w-full">
    <select ref={ref} className={[selectClassName, className].join(' ')} {...props}>
      {children}
    </select>
    <ChevronDown size={14} strokeWidth={1.75} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
  </div>
));

Select.displayName = 'Select';
