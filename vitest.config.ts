import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8',
      thresholds: {
        functions: 100,
        lines: -15,
        branches: 99,
      },
      include: ['src/lib/**/*'],
    },
  },
});
