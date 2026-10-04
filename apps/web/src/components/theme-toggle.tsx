'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'workspace-theme';
type Theme = 'light' | 'dark' | 'system';

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial = saved ?? 'system';
    setTheme(initial);
    applyTheme(initial);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (window.localStorage.getItem(STORAGE_KEY) === 'system') {
        applyTheme('system');
      }
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const onChangeTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-subtle)] p-1">
      {[
        { value: 'light', icon: Sun, label: 'Light' },
        { value: 'dark', icon: Moon, label: 'Dark' },
        { value: 'system', icon: Monitor, label: 'System' },
      ].map(({ value, icon: Icon, label }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => onChangeTheme(value as Theme)}
            className={[
              'inline-flex h-7 w-7 items-center justify-center rounded-[4px] border transition-colors duration-150 ease-out',
              active
                ? 'border-transparent bg-[var(--color-surface)] text-[var(--color-text)] shadow-none'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]',
            ].join(' ')}
          >
            <Icon size={14} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}
