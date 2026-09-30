import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['core/**/*.test.ts'],
    // La prueba de cruces usa la base de desarrollo: una sola a la vez.
    fileParallelism: false,
  },
});
