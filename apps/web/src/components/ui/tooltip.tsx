import * as React from 'react';

export type TooltipProps = {
  content: string;
  children: React.ReactNode;
};

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text)] shadow-sm group-hover:block group-focus-within:block">
        {content}
      </span>
    </span>
  );
}
