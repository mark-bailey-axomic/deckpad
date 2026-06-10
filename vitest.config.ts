import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const shared = resolve(__dirname, 'src/shared');
const renderer = resolve(__dirname, 'src/renderer/src');

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': shared, '@renderer': renderer } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts', 'src/preload/**/*.test.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup.renderer.ts']
        }
      }
    ]
  }
});
