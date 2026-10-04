export function Kbd({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={['inline-flex min-h-5 items-center rounded-[4px] border border-[var(--color-border)] bg-[var(--color-subtle)] px-1.5 text-[10px] font-medium text-[var(--color-muted)]', className].join(' ')}>
      {children}
    </kbd>
  );
}
