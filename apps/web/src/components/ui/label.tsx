import * as React from 'react';

export function Label({ className = '', ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={['mb-1.5 block text-[11px] font-medium text-[var(--color-muted)]', className].join(' ')} {...props} />;
}
