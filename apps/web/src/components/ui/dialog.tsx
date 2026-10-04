import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from './button';

export type DialogProps = {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
};

export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgba(28,25,23,0.32)] p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title ? <h3 className="text-sm font-medium text-[var(--color-text)]">{title}</h3> : null}
            {description ? <p className="mt-1 text-xs text-[var(--color-muted)]">{description}</p> : null}
          </div>
          <Button variant="ghost" size="sm" aria-label="Close dialog" onClick={() => onOpenChange(false)} className="h-8 w-8 p-0">
            <X size={14} strokeWidth={1.75} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
