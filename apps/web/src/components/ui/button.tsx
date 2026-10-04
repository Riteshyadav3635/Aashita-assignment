import * as React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border border-transparent bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-muted)]',
  secondary: 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-subtle)] disabled:border-[var(--color-border)] disabled:text-[var(--color-muted)]',
  ghost: 'border border-transparent bg-transparent text-[var(--color-text)] hover:bg-[var(--color-subtle)] disabled:text-[var(--color-muted)]',
  danger: 'border border-transparent bg-[var(--color-danger)]/10 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/15 disabled:opacity-60',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-10 px-3.5 text-sm',
};

export function Button({
  className = '',
  type = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-[6px] font-medium leading-none transition-colors duration-120 ease-out disabled:cursor-not-allowed',
        sizeClasses[size],
        variantClasses[variant],
        className,
      ].join(' ')}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={14} strokeWidth={1.75} className="animate-spin" /> : null}
      {children}
    </button>
  );
}
