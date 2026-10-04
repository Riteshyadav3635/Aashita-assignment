'use client';

import { useEffect, useState } from 'react';

export function ServerWarmupBanner() {
  const [warming, setWarming] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const timeout = window.setTimeout(() => setWarming(true), 2000);

    const check = async () => {
      try {
        const response = await fetch('/health', { cache: 'no-store' });
        if (response.ok) {
          stopped = true;
          window.clearTimeout(timeout);
          if (timer) window.clearTimeout(timer);
          setWarming(false);
          return;
        }
      } catch {
        // A sleeping API can refuse the first connection; retry until it responds.
      }
      if (!stopped) timer = window.setTimeout(() => { void check(); }, 2000);
    };

    void check();
    return () => {
      stopped = true;
      window.clearTimeout(timeout);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  if (!warming) return null;
  return <div role="status" className="fixed inset-x-0 top-0 z-[60] border-b border-amber-300/50 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">Waking up the server…</div>;
}
