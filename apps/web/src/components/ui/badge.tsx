import * as React from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'neutral';

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-subtle)] text-[var(--color-text)] border-[var(--color-border)]',
  success: 'bg-[color:rgba(5,150,105,0.12)] text-[var(--color-done)] border-transparent',
  warning: 'bg-[color:rgba(245,158,11,0.12)] text-[var(--color-in-progress)] border-transparent',
  danger: 'bg-[color:rgba(220,38,38,0.10)] text-[var(--color-danger)] border-transparent',
  neutral: 'bg-[var(--color-subtle)] text-[var(--color-muted)] border-[var(--color-border)]',
};

export function Badge({ className = '', variant = 'default', ...props }: BadgeProps) {
  return <span className={['inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', variantClasses[variant], className].join(' ')} {...props} />;
}
