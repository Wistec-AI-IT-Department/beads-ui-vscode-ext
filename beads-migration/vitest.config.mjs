import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['**/*.test.js'],
          exclude: ['app/**/*.test.js', 'node_modules/**'],
          environment: 'node',
          restoreMocks: true
        }
      },
      {
        test: {
          name: 'jsdom',
          setupFiles: ['test/setup-vitest.js'],
          include: ['app/**/*.test.js'],
          environment: 'jsdom',
          restoreMocks: true
        }
      }
    ]
  }
});
