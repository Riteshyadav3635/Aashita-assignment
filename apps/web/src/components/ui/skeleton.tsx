export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={['animate-pulse rounded-[6px] bg-[var(--color-subtle)]', className].join(' ')} />;
}
