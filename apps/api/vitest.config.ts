import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '');

  return {
    test: {
      globals: true,
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      fileParallelism: false,
    },
  };
});
