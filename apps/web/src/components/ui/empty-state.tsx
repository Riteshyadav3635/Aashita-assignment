import * as React from 'react';
import { Inbox } from 'lucide-react';
import { Button } from './button';

export type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
};

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-[8px] border border-dashed border-[var(--color-border)] bg-[var(--color-subtle)] px-6 py-8 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
        {icon ?? <Inbox size={16} strokeWidth={1.5} />}
      </div>
      <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
      {description ? <p className="mt-1 max-w-xs text-xs text-[var(--color-muted)]">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
