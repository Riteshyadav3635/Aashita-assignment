import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
      },
      colors: {
        background: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        subtle: 'var(--color-subtle)',
        border: 'var(--color-border)',
        text: 'var(--color-text)',
        muted: 'var(--color-muted)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        todo: 'var(--color-todo)',
        'in-progress': 'var(--color-in-progress)',
        done: 'var(--color-done)',
        danger: 'var(--color-danger)',
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
      },
      spacing: {
        4.5: '1.125rem',
      },
    },
  },
  plugins: [],
};

export default config;
